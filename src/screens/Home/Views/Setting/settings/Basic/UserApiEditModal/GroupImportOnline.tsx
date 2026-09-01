import { useRef, useImperativeHandle, forwardRef, useState } from 'react'
import ConfirmAlert, { type ConfirmAlertType } from '@/components/common/ConfirmAlert'
import Text from '@/components/common/Text'
import { View } from 'react-native'
import Input, { type InputType } from '@/components/common/Input'
import { createStyle, toast } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { importUserApiGroup } from '@/core/userApiGroup'

interface UrlInputType {
  setText: (text: string) => void
  getText: () => string
  focus: () => void
}
const UrlInput = forwardRef<UrlInputType, {}>((props, ref) => {
  const theme = useTheme()
  const [text, setText] = useState('')
  const [placeholder, setPlaceholder] = useState('')
  const inputRef = useRef<InputType>(null)

  useImperativeHandle(ref, () => ({
    getText() {
      return text.trim()
    },
    setText(text) {
      setText(text)
      setPlaceholder(global.i18n.t('user_api_group_btn_import_online_input_tip'))
    },
    focus() {
      inputRef.current?.focus()
    },
  }))

  return (
    <Input
      ref={inputRef}
      placeholder={placeholder}
      value={text}
      onChangeText={setText}
      style={{ ...styles.input, backgroundColor: theme['c-primary-input-background'] }}
    />
  )
})

export interface GroupImportOnlineType {
  show: () => void
}

export default forwardRef<GroupImportOnlineType, {}>((props, ref) => {
  const t = useI18n()
  const alertRef = useRef<ConfirmAlertType>(null)
  const urlInputRef = useRef<UrlInputType>(null)
  const [visible, setVisible] = useState(false)
  const [btn, setBtn] = useState({
    disabled: false,
    text: t('user_api_btn_import_online_input_confirm'),
  })

  const handleShow = () => {
    alertRef.current?.setVisible(true)
    setBtn({ disabled: false, text: t('user_api_btn_import_online_input_confirm') })
    requestAnimationFrame(() => {
      urlInputRef.current?.setText('')
      setTimeout(() => {
        urlInputRef.current?.focus()
      }, 300)
    })
  }
  useImperativeHandle(ref, () => ({
    show() {
      if (visible) handleShow()
      else {
        setVisible(true)
        requestAnimationFrame(() => {
          handleShow()
        })
      }
    },
  }))

  const handleImport = async () => {
    let url = urlInputRef.current?.getText() ?? ''
    if (!/^https?:\/\//.test(url)) {
      url = ''
      urlInputRef.current?.setText('')
    }
    if (!url.length) return
    setBtn({ disabled: true, text: t('user_api_btn_import_online_input_loading') })
    try {
      const { succeededCount, failedCount } = await importUserApiGroup(url)
      // 展示导入结果：全部成功 / 部分成功 / 失败
      if (failedCount) {
        toast(t('user_api_group_import_partial_tip', { success: succeededCount, fail: failedCount }), 'long')
      } else {
        toast(t('user_api_group_import_success_tip', { count: succeededCount }))
      }
    } catch (err: any) {
      toast(t('user_api_group_import_failed_tip', { message: err.message }), 'long')
      return
    } finally {
      setBtn({ disabled: false, text: t('user_api_btn_import_online_input_confirm') })
    }
    alertRef.current?.setVisible(false)
  }

  return visible ? (
    <ConfirmAlert
      ref={alertRef}
      onConfirm={handleImport}
      disabledConfirm={btn.disabled}
      confirmText={btn.text}
    >
      <View style={styles.reurlContent}>
        <Text style={{ marginBottom: 5 }}>{t('user_api_btn_import_group')}</Text>
        <UrlInput ref={urlInputRef} />
      </View>
    </ConfirmAlert>
  ) : null
})

const styles = createStyle({
  reurlContent: {
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: 'column',
  },
  input: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 290,
    borderRadius: 4,
  },
})
