<template>
    <Modal>
        <template slot="header">
            <Icon symbol="stop" class="type--error" />
            <h3 class="modal-title">Remove Repository</h3>
        </template>
        <div>
            <p>Are you sure you want to remove the repository from this project? This will not delete the repository from your filesystem and cannot be undone.</p>
            <div>
                The following repository will be removed:
                <div>
                    <code>{{ repository.getPath() }}</code>
                </div>
            </div>
        </div>
        <div slot="footer" class="modal-footer tertiary separated">
            <button type="button" class="btn btn-sm autofocus" @click="cancel">
                Cancel
            </button>
            <button type="button" class="btn btn-sm btn-danger" @click="confirm">
                Remove
            </button>
        </div>
    </Modal>
</template>

<script>
import Modal from '@/components/modals/Modal'
import Confirm from '@/components/modals/mixins/confirm'

export default {
    name: 'RemoveRepository',
    components: {
        Modal
    },
    mixins: [Confirm],
    props: {
        repository: {
            type: Object,
            required: true
        }
    }
}
</script>
