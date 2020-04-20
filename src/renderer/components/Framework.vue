<template>
    <div>
        <div
            class="framework has-status"
            :class="[
                `status--${status}`,
                selective ? 'selective' : ''
            ]"
        >
            <div class="header">
                <div class="title">
                    <Indicator :status="status" />
                    <h3 class="heading">
                        <span class="name">
                            {{ name }}
                        </span>
                    </h3>
                    <div class="actions">
                        <button type="button" class="btn-link more-actions" tabindex="-1" @click.prevent="openMenu">
                            <Icon symbol="kebab-vertical" />
                        </button>
                        <button class="btn btn-sm" @click="refresh" :disabled="running || refreshing" tabindex="-1">
                            <Icon symbol="sync" />
                        </button>
                        <button
                            class="btn btn-sm btn-primary"
                            :disabled="running || refreshing || noResults"
                            tabindex="-1"
                            @click="start"
                        >
                            <template v-if="selective">
                                Run selected
                                <span class="Counter">{{ selected.suites.length }}</span>
                            </template>
                            <template v-else-if="filtering && !noResults">
                                {{ 'Run match|Run matches' | plural(suites.length) }}
                                <span class="Counter">{{ suites.length }}</span>
                            </template>
                            <template v-else>Run</template>
                        </button>
                        <button
                            class="btn btn-sm"
                            :disabled="!running && !refreshing && !queued"
                            @click="stop"
                        >
                            Stop
                        </button>
                    </div>
                </div>
                <div class="filters">
                    <template v-if="!suites.length">
                        <!-- <Ledger :framework="model" /> -->
                    </template>
                    <template v-else-if="queued">
                        Queued...
                    </template>
                    <template v-else-if="refreshing">
                        Refreshing...
                    </template>
                    <template v-else>
                        No tests loaded. <a href="#" @click.prevent="refresh">Refresh</a>.
                    </template>
                </div>
                <div v-if="suites.length" class="filters search" :class="{ 'is-searching': keyword }">
                    <Icon symbol="search" />
                    <input
                        type="search"
                        class="form-control input-block input-sm"
                        placeholder="Filter items"
                        v-model="keyword"
                    >
                </div>
                <div v-if="suites.length" class="filters sort">
                    <button type="button" @click.prevent="onSortClick">
                        <template v-if="visible > 1">
                            {{ ':n item sorted by :0|:n items sorted by :0' | plural(visible) | set(displaySort) }}
                            <Icon symbol="chevron-down" />
                        </template>
                        <template v-else>
                            {{ ':n item|:n items' | plural(visible) }}
                        </template>
                    </button>
                </div>
            </div>
            <div class="children">
                <Suite
                    v-for="suite in suites"
                    :suite="suite"
                    :running="running"
                    :key="suite.file"
                    @activate="onChildActivation"
                    @refresh="refresh"
                    @filter="filterSuite"
                    @expand="expandSuite"
                />
                <footer v-if="hidden" class="cutoff">
                    <div>
                        <div v-if="noResults">No results</div>
                        <div v-else>{{ ':n hidden item|:n hidden items' | plural(hidden) }}</div>
                        <button class="btn-link" @click="resetFilters"><strong>Clear filters</strong></button>
                    </div>
                    <span class="zigzag"></span>
                </footer>
            </div>
        </div>
    </div>
</template>

<script>
import _debounce from 'lodash/debounce'
import { ipcRenderer } from 'electron'
import { Menu } from '@main/menu'
import { sortDisplayName } from '@lib/frameworks/sort'
import Indicator from '@/components/Indicator'
import Suite from '@/components/Suite'
// import Ledger from '@/components/Ledger'
import HasFrameworkMenu from '@/components/mixins/HasFrameworkMenu'
import HasStatus from '@/components/mixins/HasStatus'

export default {
    name: 'Framework',
    components: {
        Indicator,
        // Ledger,
        Suite
    },
    mixins: [
        HasFrameworkMenu,
        HasStatus
    ],
    props: {
        repositoryId: {
            type: String,
            required: true
        },
        suites: {
            type: Array,
            required: false,
            default () {
                return []
            }
        }
    },
    data () {
        return {
            name: this.model.name
        }
    },
    computed: {
        frameworkContext () {
            return {
                repository: this.repositoryId,
                framework: this.model.id
            }
        },
        running () {
            return this.status === 'running'
        },
        refreshing () {
            return this.status === 'refreshing'
        },
        queued () {
            return this.status === 'queued'
        },
        selective () {
            return false
            // @TODO: new means of determining selective status
            // return this.model.isSelective()
        },
        selected () {
            return this.model.getSelected()
        },
        filtering () {
            return false
            // @TODO: new means of determining filtering
            // return this.model.hasFilters()
        },
        visible () {
            // @TODO: new means of determining visible suites
            return this.suites.length
        },
        hidden () {
            return 0
            // @TODO: new means of determining hidden suites
            // return this.model.count() - this.visible
        },
        noResults () {
            return false
            // @TODO: new means of determining no result status
            // return this.hidden === this.model.count()
        },
        keyword: {
            get () {
                return ''
                // @TODO: new means of determining current keyword
                // return this.model.getFilter('keyword')
            },
            set: _debounce(function (value) {
                // @TODO: new means of setting filter keyword
                // this.model.setFilter('keyword', value)
            }, 150)
        },
        sort: {
            get () {
                return 'name'
                // @TODO: new means of determining current sort
                // return this.model.getSort()
            },
            set (value) {
                // @TODO: new means of setting sort
                // this.model.setSort(value)
            }
        },
        displaySort () {
            return sortDisplayName(this.sort)
        }
    },
    created () {
        ipcRenderer.on('menu-event', this.onAppMenuEvent)
    },
    beforeDestroy () {
        ipcRenderer.removeListener('menu-event', this.onAppMenuEvent)
    },
    methods: {
        refresh () {
            ipcRenderer.send('framework-refresh', this.frameworkContext)
        },
        start () {
            ipcRenderer.send('framework-start', this.frameworkContext)
        },
        async stop () {
            ipcRenderer.send('framework-stop', this.frameworkContext)
        },
        onChildActivation (context) {
            this.$emit('activate', context)
        },
        onAppMenuEvent (event, { name, properties }) {
            if (!this.model) {
                return
            }

            switch (name) {
                case 'run-framework':
                    this.start()
                    break
                case 'refresh-framework':
                    this.refresh()
                    break
                case 'stop-framework':
                    this.stop()
                    break
                case 'filter':
                    this.$el.querySelector('[type="search"]').focus()
                    break
                case 'framework-settings':
                    this.manage()
                    break
                case 'remove-framework':
                    this.remove()
                    break
            }
        },
        resetFilters () {
            this.model.resetFilters()
        },
        filterSuite (suite) {
            this.keyword = `"${suite.getRelativePath()}"`
        },
        expandSuite (identifier) {
            ipcRenderer.send('expand-suite', this.frameworkContext, identifier)
        },
        onSortClick () {
            const menu = new Menu()
            this.model.getSupportedSorts().forEach(sort => {
                menu.add({
                    label: sortDisplayName(sort),
                    type: 'checkbox',
                    checked: sort === this.sort,
                    click: () => {
                        this.sort = sort
                    }
                })
            })
            menu
                .separator()
                .add({
                    label: 'Reverse',
                    type: 'checkbox',
                    checked: this.model.isSortReverse(),
                    click: () => {
                        this.model.setSortReverse()
                    }
                })
                .attachTo(this.$el.querySelector('.sort button'))
                .open()
        }
    }
}
</script>
