import { app } from 'electron'
import { ProcessId, ProcessOptions, IProcess } from './process'
import { ProcessFactory } from '@lib/process/factory'
import pool from '@lib/process/pool'

/**
 * A bridge for spawning processes, optionally between
 * Electron's renderer and main processes.
 */
export class ProcessBridge {

    /**
     * Make a new process according to the given options.
     *
     * @param options The options for the process we're making.
     */
    public static make (options: ProcessOptions): IProcess {
        return ProcessFactory.make(options)
    }

    /**
     * Stop a running process using its id.
     *
     * @param id The id of the process to be stopped.
     */
    public static stop (id: ProcessId): Promise<void> {
        return new Promise((resolve, reject) => {
            if (typeof app !== 'undefined') {
                const running = pool.findProcess(id)
                if (!running) {
                    resolve()
                    return
                }

                running!
                    .on('killed', () => {
                        resolve()
                    })
                    .stop()
            }
        })
    }
}
