<template>
  <div class="mv-wrap">
    <video
      ref="videoRef"
      class="mv-video"
      controls
      autoplay
      :src="playInfo.url"
      @error="handleError"
    ></video>
    <div v-if="playInfo.name" class="mv-info">
      <span class="mv-name">{{ playInfo.name }}</span>
      <span v-if="playInfo.singer" class="mv-singer"> - {{ playInfo.singer }}</span>
    </div>
    <div v-if="errorMsg" class="mv-error">{{ errorMsg }}</div>
  </div>
</template>

<script>
import { ref, reactive } from 'vue'
import { onPlay } from './utils/ipc'

export default {
  name: 'App',
  setup() {
    const videoRef = ref(null)
    const errorMsg = ref('')
    const playInfo = reactive({
      url: '',
      name: '',
      singer: '',
    })

    onPlay(({ params: info }) => {
      errorMsg.value = ''
      playInfo.url = info.url
      playInfo.name = info.name
      playInfo.singer = info.singer
      // 窗口已存在、切换到新地址时，src 变化不会自动重新加载，这里手动触发
      void videoRef.value?.load?.()
      void videoRef.value?.play?.().catch(() => {})
    })

    const handleError = () => {
      errorMsg.value = '视频加载失败，播放地址可能已失效'
    }

    return {
      videoRef,
      playInfo,
      errorMsg,
      handleError,
    }
  },
}
</script>

<style>
html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
}
#root {
  width: 100%;
  height: 100%;
}
</style>

<style scoped>
.mv-wrap {
  position: relative;
  width: 100%;
  height: 100vh;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mv-video {
  width: 100%;
  height: 100%;
  background: #000;
  outline: none;
}
.mv-info {
  position: absolute;
  top: 12px;
  left: 16px;
  color: #fff;
  font-size: 14px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, .8);
  pointer-events: none;
  user-select: none;
}
.mv-name {
  font-weight: bold;
}
.mv-singer {
  opacity: .85;
}
.mv-error {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #fff;
  font-size: 14px;
  background: rgba(0, 0, 0, .6);
  padding: 10px 16px;
  border-radius: 4px;
}
</style>
