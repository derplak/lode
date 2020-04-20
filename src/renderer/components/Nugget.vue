<template>
    <div
        class="nugget"
        :class="[
            `status--${status}`,
            `is-${selectStatus}`,
            `is-${expandStatus}`,
            loading ? 'is-loading': '',
            hasChildren ? 'has-children' : ''
        ]"
        tabindex="0"
        @keydown="handleKeydown"
    >
        <div class="seam"></div>
        <div class="header" @click.prevent @mousedown.prevent.stop="handleActivate">
            <div class="status" :aria-label="displayStatus(status)" :title="displayStatus(status)">
                <Icon v-if="status === 'error'" symbol="issue-opened" />
            </div>
            <div class="header-inner">
                <slot name="header"></slot>
            </div>
            <div v-if="hasChildren" class="toggle">
                <Icon :symbol="show ? 'chevron-down' : 'chevron-right'" />
            </div>
        </div>
        <div v-if="hasChildren && show" class="nugget-items">
            <!--
            :running="running"
            :selectable="canToggleTests"
            @open="openFile"
            @activate="onChildActivation"
            -->
            <Test
                v-for="test in tests"
                :key="test.id"
                :test="test"
            />
        </div>
    </div>
</template>

<script>
import { ipcRenderer } from 'electron'
import { mapGetters } from 'vuex'
import HasStatus from '@/components/mixins/HasStatus'

export default {
    name: 'Nugget',
    mixins: [
        HasStatus
    ],
    props: {
        model: {
            type: Object,
            required: true
        },
        hasChildren: {
            type: Boolean,
            default: true
        },
        handler: {
            type: Function,
            default: null
        }
    },
    data () {
        return {
            expanded: !!this.model.expanded,
            loading: false,
            tests: []
        }
    },
    computed: {
        identifier () {
            return this.model.id || this.model.file
        },
        show () {
            return this.expanded
        },
        selectStatus () {
            return this.model.selected ? 'selected' : 'unselected'
        },
        expandStatus () {
            return this.show ? 'expanded' : 'collapsed'
        },
        ...mapGetters({
            displayStatus: 'status/display',
            inContext: 'context/inContext'
        })
    },
    mounted () {
        // If nugget is already in context (i.e. persisted contexts) then expand
        // it, because in all likelihood a child test will have to be activated,
        // in which case it needs to be mounted first.
        if (this.inContext(this.identifier)) {
            this.model.toggleExpanded()
        }
    },
    methods: {
        handleActivate (event) {
            if (this.handler) {
                if (this.handler.call() === false) {
                    return
                }
            }
            // Don't toggle children on right-clicks.
            if (this.$input.isRightButton(event)) {
                this.$el.focus()
                return
            }

            this.toggleChildren(event)
        },
        handleKeydown (event) {
            if (event.code === 'ArrowRight' && !this.$input.isCycleForward(event)) {
                event.stopPropagation()
                this.handleExpand(event)
            } else if (event.code === 'ArrowLeft' && !this.$input.isCycleBackward(event)) {
                event.stopPropagation()
                this.handleCollapse(event)
            }
        },
        handleExpand (event) {
            if (!this.hasChildren || this.show) {
                return
            }
            this.handleActivate(event)
        },
        handleCollapse (event) {
            if (!this.hasChildren || !this.show) {
                return
            }
            this.handleActivate(event)
        },
        toggleChildren (event) {
            if (!this.hasChildren) {
                return
            }

            console.log('toggling children', this.model)
            if (!this.expanded) {
                this.loading = true
                return new Promise((resolve, reject) => {
                    ipcRenderer
                        .once('tests', (event, tests) => {
                            this.tests = tests
                            this.expanded = true
                            this.loading = false
                            resolve()
                        })

                    this.$emit(`expand`, this.identifier)
                })
            }

            this.expanded = false
            this.tests = []
            return Promise.resolve()

            // @TODO: recursive with alt key
            // this.model.toggleExpanded(!this.model.expanded, this.$input.hasAltKey(event))
        },

        /**
         * Bubble up the `canOpen` verification between Test and Suite.
         */
        canOpen () {
            return this.$parent.canOpen()
        }
    }
}
</script>
