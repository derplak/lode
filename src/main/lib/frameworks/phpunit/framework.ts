import * as Path from 'path'
import * as Fs from 'fs-extra'
import { ParsedRepository } from '@main/lib/frameworks/repository'
import { FrameworkOptions, Framework } from '@main/lib/frameworks/framework'
import { ISuiteResult, Suite } from '@main/lib/frameworks/suite'
import { ITest } from '@main/lib/frameworks/test'
import { PHPUnitSuite } from '@main/lib/frameworks/phpunit/suite'

export class PHPUnit extends Framework {

    static readonly defaults: FrameworkOptions = {
        name: 'PHPUnit',
        type: 'phpunit',
        command: './vendor/bin/phpunit',
        path: ''
    }

    // Suites are defined in the parent constructor (albeit a different class),
    // so we'll just inherit the default value from it (or risk overriding it).
    public suites!: Array<PHPUnitSuite>


    /**
     * The class of suite we use for this framework. Overrides the default
     * with a PHPUnit-specific suite class.
     */
    protected suiteClass(): typeof Suite {
        return PHPUnitSuite
    }

    /**
     * Test the given files for framework existence and return appropriate
     * instantiation options, if applicable.
     *
     * @param repository The parsed repository to test.
     */
    public static spawnForDirectory (repository: ParsedRepository): FrameworkOptions | false {
        // Cheapest way to check is the PHPUnit XML config file.
        if (repository.files.includes('phpunit.xml') || repository.files.includes('phpunit.xml.dist')) {
            return this.hydrate()
        }
        // If no config file exists, check for binary inside dependencies.
        if (Fs.existsSync(Path.join(repository.path, 'vendor/bin/phpunit'))) {
            return this.hydrate()
        }
        return false
    }

    /**
     * Reload this framework's suites and tests.
     */
    protected reload (): Promise<string> {
        return new Promise((resolve, reject) => {
            this.spawn(['--columns=42'].concat(this.runArgs()))
                .on('report', ({ report }) => {
                    try {
                        report.forEach((result: ISuiteResult) => {
                            this.makeSuite(result, true)
                        })
                        resolve('success')
                    } catch (error) {
                        this.stop()
                        reject('The PHPUnit package returned unexpected results.')
                    }
                })
                .on('killed', ({ process }) => {
                    resolve('killed')
                })
                .on('error', error => {
                    reject(error)
                })
        })
    }

    /**
     * The command arguments for running this framework.
     */
    protected runArgs (): Array<string> {
        const args = [
            '--color=always',
            '--printer',
            '\\LodeApp\\PHPUnit\\LodeReporter'
        ]

        if (__DEV__) {
            args.push('--verbose')
        }

        return args
    }

    /**
     * The command arguments for running this framework selectively.
     */
    protected runSelectiveArgs (): Array<string> {
        const args: Array<string> = ['--filter']
        const filters: Array<string> = []

        this.suites.filter(suite => suite.selected).forEach(suite => {
            const suiteClass = PHPUnitSuite.escapeClassName(suite.class!)
            const selected = suite.tests.filter((test: ITest) => test.selected)
            if (selected.length !== suite.tests.length) {
                // If not running all tests from suite, filter each one
                selected.forEach((test: ITest) => {
                    filters.push(`${suiteClass}::${test.name}$`)
                })
            } else {
                filters.push(suiteClass)
            }
        })

        args.push(`"${filters.join('|')}"`)

        return args.concat(this.runArgs())
    }

    /**
     * Provide setup instructions for using Lode with Jest.
     */
    public static instructions (): string {
        return "Install the Lode PHPUnit reporter package by running `composer require lodeapp/phpunit --dev` inside your repository\'s directory."
    }

    /**
     * Troubleshoot a PHPUnit error.
     *
     * @param error The error to be parsed for troubleshooting.
     */
    protected troubleshoot (error: Error | string): string {
        if (error instanceof Error) {
            error = error.toString()
        }

        if ((new RegExp('Could not use ".*" as printer: class does not exist', 'gi')).test(error)) {
            return 'Make sure to include the Lode PHPUnit reporter package as a dependency in your repository. You can do this by running `composer require lodeapp/phpunit --dev` inside your repository\'s directory. If you already have, try running `composer dump-autoload`.'
        }

        if (error.includes('The PHPUnit package returned unexpected results.')) {
            return 'Your Lode PHPUnit package might be out of date. Please try running `composer update lodeapp/phpunit` and try again. You might want to check if there are updates available for the Lode app, too.'
        }

        return super.troubleshoot(error)
    }
}
