import { useCallback, useMemo } from 'react'
import Text from '@/components/common/Text'
import { View, TouchableOpacity, ScrollView } from 'react-native'
import { confirmDialog, createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { useUserApiList, useUserApiGroupList, state as userApiState } from '@/store/userApi'
import { useSettingValue } from '@/store/setting/hook'
import { removeUserApi, setUserApiAllowShowUpdateAlert } from '@/core/userApi'
import { removeUserApiGroupWithSources } from '@/core/userApiGroup'
import { BorderRadius } from '@/theme'
import CheckBox from '@/components/common/CheckBox'
import { Icon } from '@/components/common/Icon'
import settingState from '@/store/setting/state'
import apiSourceInfo from '@/utils/musicSdk/api-source-info'
import { setApiSource } from '@/core/apiSource'

const formatVersionName = (version: string) => {
  return /^\d/.test(version) ? `v${version}` : version
}
const ListItem = ({ item, activeId, onRemove, onChangeAllowShowUpdateAlert, hideAllowShowUpdateAlert }: {
  item: LX.UserApi.UserApiInfo
  activeId: string
  onRemove?: (id: string, name: string) => void
  onChangeAllowShowUpdateAlert: (id: string, enabled: boolean) => void
  hideAllowShowUpdateAlert?: boolean
}) => {
  const theme = useTheme()
  const t = useI18n()
  const changeAllowShowUpdateAlert = (check: boolean) => {
    onChangeAllowShowUpdateAlert(item.id, check)
  }
  const handleRemove = () => {
    onRemove?.(item.id, item.name)
  }

  return (
    <View style={{ ...styles.listItem, backgroundColor: activeId == item.id ? theme['c-primary-background-active'] : 'transparent' }}>
      <View style={styles.listItemLeft}>
        <Text size={14}>
          {item.name}
          {
            item.version ? (
              <Text size={12} color={theme['c-font-label']}>{ '   ' + formatVersionName(item.version) }</Text>
            ) : null
          }
          {
            item.author ? (
              <Text size={12} color={theme['c-font-label']}>{ '   ' + item.author }</Text>
            ) : null
          }
        </Text>
        {
          item.description ? (
            <Text size={12} color={theme['c-font-label']}>{item.description}</Text>
          ) : null
        }
        {
          hideAllowShowUpdateAlert ? null : (
            <CheckBox check={item.allowShowUpdateAlert} label={t('user_api_allow_show_update_alert')} onChange={changeAllowShowUpdateAlert} size={0.86} />
          )
        }
      </View>
      {
        onRemove ? (
          <View style={styles.listItemRight}>
            <TouchableOpacity style={styles.btn} onPress={handleRemove}>
              <Icon name="close" color={theme['c-button-font']} />
            </TouchableOpacity>
          </View>
        ) : null
      }
    </View>
  )
}

// 聚合分组的名称行：仅展示，不可点击触发任何动作，
// 分组整体移除通过其右侧的 X 按钮完成
const GroupHeader = ({ name, onRemove }: { name: string, onRemove: () => void }) => {
  const theme = useTheme()
  return (
    <View style={styles.groupHeaderRow}>
      <Text size={14} style={styles.groupNameText}>{name}</Text>
      <TouchableOpacity style={styles.btn} onPress={onRemove}>
        <Icon name="close" color={theme['c-button-font']} />
      </TouchableOpacity>
    </View>
  )
}

export interface UserApiEditModalProps {
  onSave: (rules: string) => void
  // onSourceChange: SourceSelectorProps['onSourceChange']
}
export interface UserApiEditModalType {
  show: (rules: string) => void
}


export default () => {
  const userApiListRaw = useUserApiList()
  const userApiGroupList = useUserApiGroupList()
  const apiSource = useSettingValue('common.apiSource')
  const theme = useTheme()
  const t = useI18n()

  // 将扁平的 userApiList 按 groupId 归拢：独立源保持原有渲染顺序，
  // 聚合分组的成员源整体收进一个 group 块，块的展示位置取该分组第一个成员源在列表中的原始位置
  const renderRows = useMemo(() => {
    const groupNameMap = new Map(userApiGroupList.map(g => [g.id, g.name]))
    const rows: Array<
      | { type: 'single', item: LX.UserApi.UserApiInfo }
      | { type: 'group', groupId: string, name: string, items: LX.UserApi.UserApiInfo[] }
    > = []
    const groupRowIndex = new Map<string, number>()

    for (const item of userApiListRaw) {
      if (!item.groupId) {
        rows.push({ type: 'single', item })
        continue
      }
      const existingIndex = groupRowIndex.get(item.groupId)
      if (existingIndex == null) {
        groupRowIndex.set(item.groupId, rows.length)
        rows.push({
          type: 'group',
          groupId: item.groupId,
          name: groupNameMap.get(item.groupId) ?? item.groupId,
          items: [item],
        })
      } else {
        const row = rows[existingIndex]
        if (row.type === 'group') row.items.push(item)
      }
    }
    return rows
  }, [userApiListRaw, userApiGroupList])

  const handleRemove = useCallback(async(id: string, name: string) => {
    const confirm = await confirmDialog({
      message: global.i18n.t('user_api_remove_tip', { name }),
      cancelButtonText: global.i18n.t('cancel_button_text_2'),
      confirmButtonText: global.i18n.t('confirm_button_text'),
      bgClose: false,
    })
    if (!confirm) return
    void removeUserApi([id]).finally(() => {
      if (settingState.setting['common.apiSource'] == id) {
        let backApiId = apiSourceInfo.find(api => !api.disabled)?.id
        if (!backApiId) backApiId = userApiState.list[0]?.id
        setApiSource(backApiId ?? '')
      }
    })
  }, [])

  const handleRemoveGroup = useCallback(async(groupId: string, name: string, memberIds: string[]) => {
    const confirm = await confirmDialog({
      message: global.i18n.t('user_api_group_remove_tip', { name }),
      cancelButtonText: global.i18n.t('cancel_button_text_2'),
      confirmButtonText: global.i18n.t('confirm_button_text'),
      bgClose: false,
    })
    if (!confirm) return
    const wasActive = memberIds.includes(settingState.setting['common.apiSource'])
    void removeUserApiGroupWithSources(groupId).finally(() => {
      if (wasActive) {
        let backApiId = apiSourceInfo.find(api => !api.disabled)?.id
        if (!backApiId) backApiId = userApiState.list[0]?.id
        setApiSource(backApiId ?? '')
      }
    })
  }, [])

  const handleChangeAllowShowUpdateAlert = useCallback((id: string, enabled: boolean) => {
    void setUserApiAllowShowUpdateAlert(id, enabled)
  }, [])

  return (
    <ScrollView style={styles.scrollView} keyboardShouldPersistTaps={'always'}>
      <View onStartShouldSetResponder={() => true}>
        {
          renderRows.length
            ? renderRows.map((row) =>
              row.type === 'single' ? (
                <ListItem
                  key={row.item.id}
                  item={row.item}
                  activeId={apiSource}
                  onRemove={handleRemove}
                  onChangeAllowShowUpdateAlert={handleChangeAllowShowUpdateAlert}
                />
              ) : (
                <View key={row.groupId} style={styles.groupBox}>
                  <GroupHeader
                    name={row.name}
                    onRemove={() => { void handleRemoveGroup(row.groupId, row.name, row.items.map(i => i.id)) }}
                  />
                  {row.items.map((item) => (
                    <ListItem
                      key={item.id}
                      item={item}
                      activeId={apiSource}
                      onChangeAllowShowUpdateAlert={handleChangeAllowShowUpdateAlert}
                      hideAllowShowUpdateAlert
                    />
                  ))}
                </View>
              ),
            )
            : <Text style={styles.tipText} color={theme['c-font-label']}>{t('user_api_empty')}</Text>
        }
      </View>
    </ScrollView>
  )
}


const styles = createStyle({
  scrollView: {
    paddingHorizontal: 7,
    flexGrow: 0,
  },
  list: {
    paddingBottom: 15,
    flexDirection: 'column',
  },
  listItem: {
    padding: 10,
    borderRadius: BorderRadius.normal,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listItemLeft: {
    paddingRight: 10,
    flex: 1,
    gap: 2,
  },
  listItemRight: {
    flex: 0,
  },
  btn: {
    padding: 10,
  },
  tipText: {
    textAlign: 'center',
    marginTop: 25,
    marginBottom: 15,
  },
  // 聚合分组容器：用边框把分组名称行 + 其下所有成员源包起来，和普通导入的源区分开
  groupBox: {
    borderWidth: 1,
    borderColor: 'rgba(128, 128, 128, 0.35)',
    borderRadius: BorderRadius.normal,
    paddingHorizontal: 4,
    paddingTop: 2,
    marginBottom: 4,
  },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  groupNameText: {
    fontWeight: 'bold',
  },
})
