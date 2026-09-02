<template lang="pug">
material-modal(:show="show" teleport="#view" @close="handleClose" @after-enter="$refs.input.focus()")
  main(:class="$style.main")
    h2 {{ $t('user_api_group_import_online__title') }}
    base-input(
      ref="input"
      v-model="url"
      :class="$style.input"
      type="url"
      :placeholder="$t('user_api_group_import_online__input_tip')"
      @submit="handleSubmit" @blur="verify"
    )
    div(:class="$style.footer")
      base-btn(:class="$style.btn" @click="handleClose") {{ $t('btn_close') }}
      base-btn(:class="$style.btn" :disabled="disabled" @click="handleSubmit") {{ btnText }}
</template>

<script>
import { dialog } from '@renderer/plugins/Dialog'
import { importUserApiGroup } from '@renderer/utils/ipc'

export default {
  props: {
    show: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:show', 'import'],
  data() {
    return {
      url: '',
      disabled: false,
      btnText: '',
    }
  },
  watch: {
    show(n) {
      if (n) {
        this.url = ''
        this.disabled = false
        this.btnText = this.$t('user_api_group_import_online__input_confirm')
      }
    },
  },
  methods: {
    handleClose() {
      this.$emit('update:show', false)
    },
    verify() {
      if (!/^https?:\/\//.test(this.url)) this.url = ''
      return this.url
    },
    async handleSubmit() {
      let url = this.verify()
      if (!url) return
      this.disabled = true
      this.btnText = this.$t('user_api_group_import_online__input_loading')
      let result
      try {
        result = await importUserApiGroup(url)
      } catch (err) {
        void dialog(this.$t('user_api_group_import__failed', { message: err.message }))
        return
      } finally {
        this.disabled = false
        this.btnText = this.$t('user_api_group_import_online__input_confirm')
      }
      if (result.failedCount) {
        void dialog(this.$t('user_api_group_import__partial', { success: result.succeededCount, fail: result.failedCount }))
      } else {
        void dialog(this.$t('user_api_group_import__success', { count: result.succeededCount }))
      }
      this.$emit('import', result)
      this.handleClose()
    },
  },
}
</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.main {
  padding: 0 15px;
  width: 450px;
  min-width: 280px;
  display: flex;
  flex-flow: column nowrap;
  min-height: 0;
  h2 {
    font-size: 13px;
    color: var(--color-font);
    line-height: 1.3;
    word-break: break-all;
    padding: 15px 0 8px;
  }
}

.input {
  padding: 8px 8px;
}
.footer {
  margin: 20px 0 15px auto;
}
.btn {
  min-width: 70px;

  +.btn {
    margin-left: 10px;
  }
}


</style>
