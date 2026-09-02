<template lang="pug">
material-modal(:show="modelValue" bg-close teleport="#view" @close="handleClose")
  main.scroll(:class="$style.main")
    h2 {{ $t('user_api__title') }}
    ul.scroll(v-if="renderRows.length" :class="$style.content")
      template(v-for="row in renderRows" :key="row.type === 'single' ? row.api.id : row.groupId")
        li(v-if="row.type === 'single'" :class="[$style.listItem, {[$style.active]: appSetting['common.apiSource'] == row.api.id}]")
          div(:class="$style.listLeft")
            h3
              | {{ row.api.name }}
              span(v-if="row.api.version") {{ /^\d/.test(row.api.version) ? `v${row.api.version}` : row.api.version }}
              span(v-if="row.api.author") {{ row.api.author }}
            p {{ row.api.description }}
            div
              base-checkbox(:id="`user_api_${row.api.id}`" v-model="row.api.allowShowUpdateAlert" :class="$style.checkbox" :label="$t('user_api__allow_show_update_alert')" @change="handleChangeAllowUpdateAlert(row.api, $event)")
          base-btn(:class="$style.listBtn" outline :aria-label="$t('user_api__btn_remove')" @click.stop="handleRemove(row.api.id)")
            svg(v-once version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 212.982 212.982" space="preserve")
              use(xlink:href="#icon-delete")
        li(v-else :class="$style.groupBox")
          div(:class="$style.groupHeader")
            span(:class="$style.groupName" tabindex="0") {{ row.name }}
            base-btn(:class="$style.listBtn" outline :aria-label="$t('user_api_group__btn_remove')" @click.stop="handleRemoveGroup(row.groupId, row.name)")
              svg(v-once version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 212.982 212.982" space="preserve")
                use(xlink:href="#icon-delete")
          div(v-for="api in row.items" :key="api.id" :class="[$style.listItem, $style.groupListItem, {[$style.active]: appSetting['common.apiSource'] == api.id}]")
            div(:class="$style.listLeft")
              h3
                | {{ api.name }}
                span(v-if="api.version") {{ /^\d/.test(api.version) ? `v${api.version}` : api.version }}
                span(v-if="api.author") {{ api.author }}
              p {{ api.description }}
              div
                base-checkbox(:id="`user_api_${api.id}`" v-model="api.allowShowUpdateAlert" :class="$style.checkbox" :label="$t('user_api__allow_show_update_alert')" @change="handleChangeAllowUpdateAlert(api, $event)")
    div(v-else :class="$style.content")
      div(:class="$style.noitem") {{ $t('user_api__noitem') }}
    div(:class="$style.note")
      p(:class="[$style.ruleLink]")
        | {{ $t('user_api__readme') }}
        span.hover.underline(aria-label="https://lxmusic.toside.cn/desktop/custom-source" @click="handleOpenUrl('https://lyswhut.github.io/lx-music-doc/desktop/custom-source')") FAQ
      p {{ $t('user_api__note') }}
    div(:class="$style.footer")
      base-btn(:class="$style.footerBtn" @click="isShowOnlineImportModal = true") {{ $t('user_api__btn_import_online') }}
      base-btn(:class="$style.footerBtn" @click="isShowGroupImportModal = true") {{ $t('user_api_group__btn_import') }}
      base-btn(:class="$style.footerBtn" @click="handleImport") {{ $t('user_api__btn_import') }}
      //- base-btn(:class="$style.footerBtn" @click="handleExport") {{ $t('user_api__btn_export') }}
    UserApiOnlineImportModal(v-model:show="isShowOnlineImportModal" @import="importUserApi")
    UserApiGroupImportModal(v-model:show="isShowGroupImportModal" @import="handleGroupImported")
</template>

<script>
import { importUserApi, removeUserApi, removeUserApiGroup, showSelectDialog, setAllowShowUserApiUpdateAlert } from '@renderer/utils/ipc'
import { readFile } from '@common/utils/nodejs'
import { openUrl } from '@common/utils/electron'
import apiSourceInfo from '@renderer/utils/musicSdk/api-source-info'
import { userApi } from '@renderer/store'
import { appSetting, updateSetting } from '@renderer/store/setting'
import { computed, ref } from '@common/utils/vueTools'
import { dialog } from '@renderer/plugins/Dialog'

import UserApiOnlineImportModal from './UserApiOnlineImportModal.vue'
import UserApiGroupImportModal from './UserApiGroupImportModal.vue'

export default {
  components: {
    UserApiOnlineImportModal,
    UserApiGroupImportModal,
  },
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:modelValue'],
  setup() {
    const isShowOnlineImportModal = ref(false)
    const isShowGroupImportModal = ref(false)
    const apiList = computed(() => userApi.list)

    // 将扁平的 apiList 按 groupId 归拢：独立源保持原有渲染顺序，
    // 聚合分组的成员源整体收进一个 group 块，块的展示位置取该分组第一个成员源在列表中的原始位置
    const renderRows = computed(() => {
      const groupNameMap = new Map(userApi.groupList.map(g => [g.id, g.name]))
      const rows = []
      const groupRowIndex = new Map()

      for (const api of apiList.value) {
        if (!api.groupId) {
          rows.push({ type: 'single', api })
          continue
        }
        const existingIndex = groupRowIndex.get(api.groupId)
        if (existingIndex == null) {
          groupRowIndex.set(api.groupId, rows.length)
          rows.push({
            type: 'group',
            groupId: api.groupId,
            name: groupNameMap.get(api.groupId) ?? api.groupId,
            items: [api],
          })
        } else {
          rows[existingIndex].items.push(api)
        }
      }
      return rows
    })

    return {
      userApi,
      apiList,
      renderRows,
      appSetting,
      isShowOnlineImportModal,
      isShowGroupImportModal,
    }
  },
  methods: {
    async importUserApi(script) {
      return importUserApi(script).then(({ apiList }) => {
        userApi.list = apiList
      }).catch((err) => {
        void dialog(this.$t('user_api_import__failed', { message: err.message }))
      })
    },
    handleGroupImported({ apiList }) {
      userApi.list = apiList
    },
    handleImport() {
      if (this.userApi.list.length > 20) {
        this.$dialog({
          message: this.$t('user_api__max_tip'),
          confirmButtonText: this.$t('ok'),
        })
        return
      }
      void showSelectDialog({
        title: this.$t('user_api__import_file'),
        properties: ['openFile'],
        filters: [
          { name: 'LX API File', extensions: ['js'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      }).then(async result => {
        if (result.canceled) return
        return readFile(result.filePaths[0]).then(async data => {
          return this.importUserApi(data.toString())
        })
      })
    },
    handleExport() {

    },
    async handleRemove(apiId) {
      const api = this.apiList.find(a => a.id === apiId)
      if (!api) return
      const confirm = await dialog.confirm(this.$t('user_api_remove_tip', { name: api.name }))
      if (!confirm) return
      if (appSetting['common.apiSource'] == api.id) {
        let backApi = apiSourceInfo.find(api => !api.disabled)
        if (!backApi) backApi = userApi.list[0]
        updateSetting({ 'common.apiSource': backApi?.id ?? '' })
      }
      userApi.list = await removeUserApi([api.id])
    },
    async handleRemoveGroup(groupId, name) {
      const confirm = await dialog.confirm(this.$t('user_api_group_remove_tip', { name }))
      if (!confirm) return
      // 以扁平源列表按 groupId 判断是否正在使用组内源，
      // 兼容分组记录缺失的"幽灵分组"（历史版本 bug 遗留），此时 group 可能为 undefined
      const wasActive = userApi.list.some(api => api.groupId === groupId && api.id === appSetting['common.apiSource'])
      userApi.list = await removeUserApiGroup(groupId)
      userApi.groupList = userApi.groupList.filter(g => g.id !== groupId)
      if (wasActive) {
        let backApi = apiSourceInfo.find(api => !api.disabled)
        if (!backApi) backApi = userApi.list[0]
        updateSetting({ 'common.apiSource': backApi?.id ?? '' })
      }
    },
    handleClose() {
      this.$emit('update:modelValue', false)
    },
    handleOpenUrl(url) {
      void openUrl(url)
    },
    handleChangeAllowUpdateAlert(api, enable) {
      void setAllowShowUserApiUpdateAlert(api.id, enable)
    },
  },
}
</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.main {
  padding: 15px 8px;
  max-width: 550px;
  min-width: 300px;
  display: flex;
  flex-flow: column nowrap;
  min-height: 0;
  // max-height: 100%;
  // overflow: hidden;
  h2 {
    font-size: 16px;
    color: var(--color-font);
    line-height: 1.3;
    text-align: center;
  }
}

.name {
  color: var(--color-primary);
}

.checkbox {
  margin-top: 3px;
  font-size: 14px;
  opacity: .86;
}

.content {
  flex: auto;
  min-height: 80px;
  max-height: 100%;
  margin-top: 15px;
  padding: 0 7px;
}
.listItem {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  transition: background-color 0.2s ease;
  padding: 15px 10px;
  border-radius: @radius-border;
  &:hover {
    background-color: var(--color-primary-background-hover);
  }
  &.active {
    background-color: var(--color-primary-background-active);
  }
  h3 {
    font-size: 15px;
    color: var(--color-font);
    word-break: break-all;
    span {
      font-size: 12px;
      color: var(--color-font-label);
      margin-left: 6px;
    }
  }
  p {
    margin-top: 5px;
    font-size: 14px;
    color: var(--color-font-label);
    word-break: break-all;
  }
}
// 聚合分组容器：用边框把分组名称行 + 其下所有成员源包起来，和普通导入的源区分开
.groupBox {
  border: 1px solid var(--color-border, rgba(128, 128, 128, 0.35));
  border-radius: @radius-border;
  padding: 6px 4px;
  margin: 4px 0;
}
.groupHeader {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  padding: 6px 10px 6px 14px;
}
.groupName {
  flex: auto;
  min-width: 0;
  font-size: 14px;
  font-weight: bold;
  color: var(--color-font);
  word-break: break-all;
  outline: none;
  border-radius: 4px;
  padding: 2px 4px;
  cursor: default;
  &:focus-visible {
    box-shadow: 0 0 0 2px var(--color-primary);
  }
}
.groupListItem {
  padding-left: 20px;
}
.noitem {
  height: 100px;
  font-size: 18px;
  color: var(--color-font-label);
  display: flex;
  justify-content: center;
  align-items: center;
}
.listLeft {
  flex: auto;
  min-width: 0;
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
}
.listBtn {
  flex: none;
  height: 30px;
  width: 30px;
  padding: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  svg {
    width: 60%;
  }
}
.note {
  padding: 0 7px;
  margin-top: 15px;
  font-size: 12px;
  line-height: 1.25;
  color: var(--color-font);
  p {
    + p {
      margin-top: 5px;
    }
  }
}
.footer {
  padding: 0 7px;
  margin-top: 15px;
  display: flex;
  flex-flow: row nowrap;
}
.footerBtn {
  flex: auto;
  height: 36px;
  line-height: 36px;
  padding: 0 10px !important;
  width: 150px;
  .mixin-ellipsis-1();
  + .footerBtn {
    margin-left: 15px;
  }
}
.ruleLink {
  .mixin-ellipsis-1();
}

</style>
