import '@lib/crash/reporter'
import '@lib/logger/main'
import '@lib/tracker/main'

import Fs from 'fs'
import { compact } from 'lodash'
import { app, ipcMain, session, shell } from 'electron'
import { applicationMenu } from './menu'
import { BrowserWindow, Window } from './window'
import { Updater } from './updater'
import { openDirectorySafe } from './shell'
import { LogLevel } from '@lib/logger/levels'
import { mergeEnvFromShell } from '@lib/process/shell'
import { state } from '@lib/state'
import { log as writeLog } from '@lib/logger'
import { ProjectOptions } from '@lib/frameworks/project'
import { FrameworkContext } from '@lib/frameworks/framework'
import { ISuiteResult, ISuite } from '@lib/frameworks/suite'
import { ITestResult } from '@lib/frameworks/test'

// Expose garbage collector
app.commandLine.appendSwitch('js-flags', '--expose_gc')

// Merge environment variables from shell, if needed.
mergeEnvFromShell()

// Set `__static` path to static files in production
if (process.env.NODE_ENV !== 'development') {
    (global as any).__static = require('path').join(__dirname, '/static').replace(/\\/g, '\\\\')
} else {
    // Check for special development scripts (e.g. migrations)
    const argv = process.argv.slice(3)
    if (argv.length) {
        if (argv[0] === 'migrate') {
            if (argv[1] === 'down') {
                state.migrateDownTo()
            } else if (argv[1] === 'up') {
                state.migrateUpTo()
            }
        }
        process.exit()
    }
}

let mainWindow: Window | null = null

function createWindow(projectId: string | null) {
    const window = new Window(projectId)

    window.onClose((event: Electron.IpcMainEvent) => {
        if (window.isBusy()) {
            log.info('Window is busy. Attempting teardown of pending renderer processes.')
            event.preventDefault()
            window.send('close')
        }
    })

    window.onClosed(() => {
        mainWindow = null
        app.quit()
    })

    window.load()
    mainWindow = window
}

app
    .on('ready', () => {
        session!.defaultSession!.webRequest.onHeadersReceived((details, callback) => {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': [compact([
                        'default-src \'self\'',
                        process.env.NODE_ENV === 'development' ? 'style-src \'self\' \'unsafe-inline\'' : ''
                    ]).join('; ')]
                }
            })
        })

        track.screenview('Application started')
        createWindow(state.getCurrentProject())
        applicationMenu.build()

        if (!__DEV__) {
            // Start auto-updating process.
            new Updater()
        }
    })
    .on('window-all-closed', () => {
        if (__DARWIN__) {
            app.quit()
        }
    })
    .on('activate', () => {
        if (mainWindow === null) {
            createWindow(state.getCurrentProject())
        }
    })

ipcMain
    .on('log', (event: Electron.IpcMainEvent, level: LogLevel, message: string) => {
        // Write renderer messages to log, if they meet the level threshold.
        // We're using the main log function directly so that they are not
        // marked as being from the "main" process.
        writeLog(level, message)
    })
    .on('reset-settings', (event: Electron.IpcMainEvent) => {
        state.reset()
        const window = (BrowserWindow.fromWebContents(event.sender) as BrowserWindow)
        window.reload()
    })
    .on('menu-refresh', (event: Electron.IpcMainEvent) => {
        applicationMenu.build().then((template: Array<Electron.MenuItemConstructorOptions>) => {
            event.sender.send('menu-updated', template)
        })
    })
    .on('menu-set-options', (event: Electron.IpcMainEvent, options: any) => {
        applicationMenu.setOptions(options).then((template: Array<Electron.MenuItemConstructorOptions>) => {
            event.sender.send('menu-updated', template)
        })
    })
    .on('window-should-close', () => {
        process.nextTick(() => {
            if (mainWindow) {
                mainWindow.close()
            }
        })
    })
    .on('project-save', (event: Electron.IpcMainEvent, projectOptions: ProjectOptions) => {
            const project = (BrowserWindow.fromWebContents(event.sender) as BrowserWindow).getProject()
            if (project) {
                project.update(projectOptions)
            }
        })
    .on('project-switch', (event: Electron.IpcMainEvent, projectId: string) => {
        state.set('currentProject', projectId)
        const window = (BrowserWindow.fromWebContents(event.sender) as BrowserWindow)
        const doSwitch = () => {
            window.setProject(projectId)
            event.sender.send('project-switched', window.getProjectOptions())
        }

        // If window has an active project, stop it before doing the switch.
        const project = window.getProject()
        if (project) {
            project.stop().then(doSwitch)
            return
        }
        doSwitch()
    })
    .on('framework-get-suites', (event: Electron.IpcMainEvent, frameworkId: string) => {
        state.getSuites(frameworkId).then((suites: Array<ISuiteResult>) => {
            event.sender.send('framework-suites', suites)
        })
    })
    .on('framework-start', (event: Electron.IpcMainEvent, context: FrameworkContext) => {
        const project = (BrowserWindow.fromWebContents(event.sender) as BrowserWindow).getProject()
        if (project) {
            const framework = project.getFrameworkByContext(context)
            if (framework) {
                framework.start()
                return
            }
        }
        log.error(`Unable to find framework to run with context '${JSON.stringify(context)}'`)
    })
    .on('framework-stop', (event: Electron.IpcMainEvent, context: FrameworkContext) => {
        const project = (BrowserWindow.fromWebContents(event.sender) as BrowserWindow).getProject()
        if (project) {
            const framework = project.getFrameworkByContext(context)
            if (framework) {
                framework.stop()
                return
            }
        }
        log.error(`Unable to find framework to run with context '${JSON.stringify(context)}'`)
    })
    .on('expand-suite', async (event: Electron.IpcMainEvent, context: FrameworkContext, identifier: string) => {
        const project = (BrowserWindow.fromWebContents(event.sender) as BrowserWindow).getProject()
        if (project) {
            const framework = project.getFrameworkByContext(context)
            if (framework) {
                const suite: ISuite | undefined = framework.getSuiteByIdentifier(identifier)
                if (suite) {
                    await suite.toggleExpanded()
                    console.log('HEY', suite, suite.getTestIds())
                    state.getTests(suite.getTestIds()).then((tests: Array<ITestResult>) => {
                        event.sender.send('tests', tests)
                    })
                }
            }
        }
        log.error(`Unable to find framework to run with context '${JSON.stringify(context)}'`)
    })
    .on('show-item-in-folder', (event: Electron.IpcMainEvent, path: string) => {
        Fs.stat(path, (err, stats) => {
            if (err) {
                log.error(`Unable to find file at '${path}'`, err)
                return
            }

            if (!__DARWIN__ && stats.isDirectory()) {
                openDirectorySafe(path)
            } else {
                shell.showItemInFolder(path)
            }
        })
    })
