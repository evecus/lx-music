import { memo } from 'react'
import { View, TouchableOpacity } from 'react-native'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'

export type TabType = 'song' | 'mv'

export default memo(({ tab, onChange }: { tab: TabType, onChange: (tab: TabType) => void }) => {
  const theme = useTheme()

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={{ ...styles.tab, backgroundColor: tab == 'song' ? theme['c-primary-background-hover'] : 'rgba(0,0,0,0)' }}
        onPress={() => { onChange('song') }}
      >
        <Text size={13} color={tab == 'song' ? theme['c-primary-font-active'] : theme['c-font-label']}>歌曲</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={{ ...styles.tab, backgroundColor: tab == 'mv' ? theme['c-primary-background-hover'] : 'rgba(0,0,0,0)' }}
        onPress={() => { onChange('mv') }}
      >
        <Text size={13} color={tab == 'mv' ? theme['c-primary-font-active'] : theme['c-font-label']}>MV</Text>
      </TouchableOpacity>
    </View>
  )
})

const styles = createStyle({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    paddingTop: 6,
    paddingBottom: 6,
    gap: 10,
  },
  tab: {
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 14,
  },
})
