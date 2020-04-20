<template>
    <div
        class="sidebar-item has-status"
        :class="[
            `status--${status}`,
            menuActive ? 'is-menu-active' : '',
            isEmpty ? '' : 'is-empty'
        ]"
    >
        <div class="header" @contextmenu="openMenu" @click="toggle">
            <div class="title">
                <Indicator :status="status" />
                <h4 class="heading">
                    <Icon class="toggle" :symbol="show ? 'chevron-down' : 'chevron-right'" />
                    <span class="name" :title="name">
                        {{ name }}
                    </span>
                </h4>
            </div>
        </div>
        <div v-if="show">
            <slot></slot>
        </div>
    </div>
</template>

<script>
import Indicator from '@/components/Indicator'
import HasRepositoryMenu from '@/components/mixins/HasRepositoryMenu'
import HasStatus from '@/components/mixins/HasStatus'

export default {
    name: 'SidebarRepository',
    components: {
        Indicator
    },
    mixins: [
        HasRepositoryMenu,
        HasStatus
    ],
    data () {
        return {
            name: this.model.name,
            isEmpty: !this.model.frameworks.length
        }
    },
    computed: {
        show () {
            return this.model.expanded
        }
    },
    methods: {
        start () {
            this.model.start()
        },
        refresh () {
            this.model.refresh()
        },
        stop () {
            this.model.stop()
        },
        toggle () {
            this.model.toggle()
        }
    }
}
</script>
