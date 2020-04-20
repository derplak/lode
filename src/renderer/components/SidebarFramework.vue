<template>
    <div
        :key="model.id"
        class="sidebar-item sidebar-item--framework has-status"
        :class="[
            `status--${status}`,
        ]"
    >
        <div
            class="header"
            @mousedown="activate"
            @contextmenu="openMenu"
        >
            <div class="title">
                <Indicator :status="status" />
                <h4 class="heading">
                    <span class="name" :title="name">
                        {{ name }}
                    </span>
                </h4>
            </div>
        </div>
    </div>
</template>

<script>
import Indicator from '@/components/Indicator'
import HasFrameworkMenu from '@/components/mixins/HasFrameworkMenu'
import HasStatus from '@/components/mixins/HasStatus'

export default {
    name: 'SidebarFramework',
    components: {
        Indicator
    },
    mixins: [
        HasFrameworkMenu,
        HasStatus
    ],
    props: {
        repositoryId: {
            type: String,
            required: true
        }
    },
    data () {
        return {
            name: this.model.name
        }
    },
    methods: {
        activate () {
            this.model.active = true
            this.$emit('activate', this.model.id)
        }
    }
}
</script>
