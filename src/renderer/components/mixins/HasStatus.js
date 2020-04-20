import { ipcRenderer } from 'electron'

export default {
    props: {
        model: {
            type: Object,
            required: true
        }
    },
    data () {
        return {
            queued: false,
            status: this.model.status || 'idle'
        }
    },
    computed: {
        displayStatus () {
            return this.queued ? 'queued' : (this.status || 'idle')
        },
        identifier () {
            return this.model.id
        }
    },
    created () {
        // @TODO: check frameworks being instantiated twice when switching in sidebar
        // console.log('created')
        ipcRenderer
            .on(`${this.identifier}:status`, this.statusListener)
    },
    destroyed () {
        ipcRenderer
            .removeListener(`${this.identifier}:status`, this.statusListener)
    },
    methods: {
        queue () {
            this.queued = true
        },
        reset () {
            this.status = null
        },
        statusListener (event, to, from) {
            this.status = to
            this.queued = false
        }
    }
}
