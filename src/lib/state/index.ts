import * as Path from 'path'
import * as Fs from 'fs-extra'
import latinize from 'latinize'
import { v4 as uuid } from 'uuid'
import { find, findIndex, omit, sortBy, uniqBy } from 'lodash'
import { EventEmitter } from 'events'
import { app } from 'electron'
import ElectronStore from 'electron-store'
import LinvoDB from 'linvodb3'
import * as db from 'leveldown'
import { Project } from '@lib/state/project'
import { Migrator } from '@lib/state/migrator'
import { ProjectIdentifier } from '@lib/frameworks/project'
import { ISuiteResult } from '@lib/frameworks/suite'
import { ITestResult } from '@lib/frameworks/test'

export type Database = {
    suites: any
    tests: any
}

export class State extends EventEmitter {
    protected store: any
    protected currentVersion: number = 1
    protected defaultSettings: object = {
        userid: uuid(),
        concurrency: 3,
        confirm: {
            switchProject: true
        },
        currentProject: null,
        paneSizes: [16, 44, 40],
        projects: []
    }

    protected db: Database = {
        suites: null,
        tests: null
    }

    constructor () {
        super()
        this.store = new ElectronStore({
            encryptionKey: 'v1',
            defaults: {
                ...this.defaultSettings,
                ...{
                    version: this.currentVersion
                }
            }
        })
        log.info('Initializing main store with version: ' + this.getVersion())

        if (__MIGRATE__) {
            this.runMigrations()
        }

        if (!app) {
            return
        }

        LinvoDB.defaults.store = { db }
        LinvoDB.dbPath = app.getPath('userData')
        this.db = {
            suites: new LinvoDB('Suites', {
                file: {
                    type: String
                }
            }),
            tests: new LinvoDB('Tests', {})
        }
        this.db.suites.ensureIndex({ fieldName: "file", unique: true })
        this.db.tests.ensureIndex({ fieldName: "id", unique: true })

        this.db.suites.count({}, function (err: Error, count: any) {
            console.log({ err, count })
        })

        this.db.tests.count({}, function (err: Error, count: any) {
            console.log({ err, count })
        })

        // Allow recursive mapping of tests.
        const mapTests = (tests: any) => {
            if (tests && tests.length) {
                return tests.map((test: any) => {
                    this.db.tests.save({
                        id: test.id,
                        name: test.name,
                        displayName: test.displayName,
                        status: test.status,
                        feedback: test.feedback,
                        console: test.console,
                        stats: test.stats,
                        testIds: mapTests(test.tests)
                    })

                    return test.id
                })
            }

            return []
        }

        // Migrate on load?
        if (false) {
            this.getAvailableProjects().forEach(({ id }) => {
                const projectState = this.project(id)
                const projectOptions = projectState.get().options
                projectOptions.repositories.forEach((repository: any, i: number) => {
                    repository.frameworks.forEach((framework: any, j: number) => {
                        if (framework.suites) {
                            framework.suites.forEach((suite: any) => {
                                this.db.suites.save({
                                    file: suite.file,
                                    status: suite.status,
                                    frameworkId: framework.id,
                                    testIds: mapTests(suite.tests),
                                    meta: suite.meta,
                                    console: suite.console
                                })
                            })

                            // After parsing, remove suites.
                            delete projectOptions.repositories[i].frameworks[j].suites
                        }

                        if (framework.active) {
                            projectOptions.active = {
                                framework: framework.id
                            }
                        }

                        // Remove active property from the framework.
                        delete projectOptions.repositories[i].frameworks[j].active
                    })
                })

                projectState.save(projectOptions)

                return true
            })
        }
    }

    protected getVersion (): number {
        return this.get('version', 1)
    }

    protected isMainProcess (): boolean {
        return typeof app !== 'undefined'
    }

    protected runMigrations (): void {
        if (!this.isMainProcess()) {
            return
        }

        this.migrateUpTo()
    }

    public migrateUpTo (target?: number): void {
        if (!target) {
            target = this.currentVersion
        }
        let version = this.getVersion()
        if (version < target) {
            while (version < target) {
                version++
                log.info('Migrating main store to version: ' + version)
                const migrator: Migrator = new Migrator(this, version)
                try {
                    migrator.up()
                    this.set('version', version)
                } catch (error) {
                    log.error('Migration of main store to version "' + version + '" failed. Aborting.')
                }
            }
        }
    }

    public migrateDownTo (target: number = 0): void {
        let version = this.getVersion()
        if (version > target) {
            while (version > target) {
                version--
                log.info('Migrating main store to version: ' + version)
                const migrator: Migrator = new Migrator(this, (version + 1))
                try {
                    migrator.down()
                    this.set('version', version)
                } catch (error) {
                    log.error('Migration of main store to version "' + version + '" failed. Aborting.')
                }
            }
        }
    }

    public get (key?: string, fallback?: any): any {
        if (!key) {
            return this.store.store
        }

        return this.store.get(key, fallback)
    }

    public set (key: string | object, value?: any): void {
        this.emit('set:' + key, value)
        return this.store.set(key, value)
    }

    public save (state: object, overwrite = false): void {
        if (!overwrite) {
            state = { ...this.get(), ...state}
        }
        this.store.set(state)
        this.emit('save', state)
    }

    public reset (): void {
        log.info('Resetting settings.')
        this.emit('clear', this.get())
        this.store.clear()
        const userData = app.getPath('userData')
        if (userData) {
            Fs.removeSync(Path.join(userData, 'Projects'))
        }
    }

    public hasProjects (): boolean {
        return this.store.get('projects', []).length > 0
    }

    public getCurrentProject (): string | null {
        const currentProject = this.store.get('currentProject', null)
        // If current project is not set or it doesn't exist in the full list of projects, return null.
        if (!currentProject || !find(this.store.get('projects'), { id: currentProject })) {
            return null
        }
        return currentProject
    }

    public getAvailableProjects (): Array<ProjectIdentifier> {
        return sortBy(this.store.get('projects'), [(project: ProjectIdentifier) => {
            return latinize(project.name).toLowerCase()
        }])
    }

    public removeProject (projectId: string): string | null {
        const projects = this.store.get('projects', [])
        const projectIndex = findIndex(projects, { id: projectId })
        if (projectIndex > -1) {
            projects.splice(projectIndex, 1)
            this.store.set('projects', projects)
            // After removing project, switch to left adjacent project, or reset
            const index = Math.max(0, (projectIndex - 1))
            const switchTo = typeof projects[index] !== 'undefined' ? projects[index].id : null
            this.store.set('currentProject', switchTo)
            return switchTo
        }
        return projectId
    }

    public updateProject (options: ProjectIdentifier): void {
        const projects = this.store.get('projects', [])
        const projectIndex = findIndex(projects, { id: options.id })
        if (projectIndex > -1) {
            projects[projectIndex] = {
                ...projects[projectIndex],
                ...options
            }
            this.store.set('projects', projects)
        }
    }

    public project (id: string): Project {
        const project = new Project(id)
        // If project already has a name, add it to the available projects list.
        if (project.get('options.name')) {
            this.store.set('projects', uniqBy(this.store.get('projects', []).concat([{
                id,
                name: project.get('options.name')
            }]), 'id'))
        }
        return project
    }

    public async insertSuite (suite: ISuiteResult): Promise<any> {
        return new Promise((resolve, reject) => {
            this.db.suites.insert(omit(suite, 'tests'), (error: Error, entry: any) => {
                return error ? reject(error) : resolve(entry)
            })
        })
    }

    public async saveSuite (suite: ISuiteResult): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.suites.findOne({ file: suite.file }, async (error: Error, entry: any) => {
                if (error) {
                    reject(error)
                    return
                }
                if (!entry) {
                    entry = await this.insertSuite(suite)
                }

                (Object.keys(<ISuiteResult>omit(suite, 'tests')) as Array<keyof ISuiteResult>)
                    .forEach((key: keyof ISuiteResult) => {
                        entry[key] = suite[key]
                    })
                    entry.save()
                    Promise.all((suite.tests || []).map((test: ITestResult) => {
                        return this.saveTest(test)
                    })).then(() => {
                        resolve(entry)
                    }).catch((error: Error) => {
                        reject(error)
                    })
            })
        })
    }

    public async insertTest (test: ITestResult): Promise<any> {
        return new Promise((resolve, reject) => {
            this.db.tests.insert(omit(test, 'tests'), (error: Error, entry: any) => {
                return error ? reject(error) : resolve(entry)
            })
        })
    }

    public async saveTest (test: ITestResult): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.tests.findOne({ id: test.id }, async (error: Error, entry: any) => {
                if (error) {
                    reject(error)
                    return
                }
                if (!entry) {
                    entry = await this.insertTest(test)
                }

                (Object.keys(<ITestResult>omit(test, 'tests')) as Array<keyof ITestResult>)
                    .forEach((key: keyof ITestResult) => {
                        entry[key] = test[key]
                    })
                    entry.save()
                    Promise.all((test.tests || []).map((test: ITestResult) => {
                        return this.saveTest(test)
                    })).then(() => {
                        resolve(entry)
                    }).catch((error: Error) => {
                        reject(error)
                    })
            })
        })
    }

    public async getSuites (frameworkId: string): Promise<Array<ISuiteResult>> {
        return new Promise((resolve, reject) => {
            this.db.suites.find({ frameworkId }, ((error: Error, results: Array<ISuiteResult>) => {
                return error ? reject(error) : resolve(results)
            }))
        })
    }

    public async getTests (testIds: Array<string>): Promise<Array<ITestResult>> {
        return new Promise((resolve, reject) => {
            this.db.tests.find({ id: { $in: testIds }}, ((error: Error, results: Array<ITestResult>) => {
                return error ? reject(error) : resolve(results)
            }))
        })
    }
}

export const state = new State()
