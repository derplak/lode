import * as path from 'path'
import { FrameworkOptions, Framework } from '@lib/frameworks/framework'
import { Suite } from '@lib/frameworks/suite'

export class Jest extends Framework {
    readonly name = 'Jest'

    constructor (options: FrameworkOptions) {
        super(options)
    }

    reload (): Promise<void> {
        return new Promise((resolve, reject) => {
            this.spawn(['--listTests'])
                .on('success', ({ process }) => {
                    process.getLines()
                        .sort()
                        .filter((file: string) => this.fileInPath(file))
                        .map((file: string) => this.makeSuite(Suite.buildResult({
                            file,
                            testsLoaded: false
                        })))
                    resolve()
                })
                .on('error', ({ message }) => {
                    reject(message)
                })
        })
    }

    runArgs (): Array<string> {
        return ['--reporters', path.resolve(__dirname, '../../bridge/jest/reporter.js')]
    }

    runSelectiveArgs (): Array<string> {
        const args: Array<string> = []

        this.suites.filter(suite => suite.selected).forEach(suite => {
            args.push(suite.relative)
        })

        return args.concat(this.runArgs())
    }
}