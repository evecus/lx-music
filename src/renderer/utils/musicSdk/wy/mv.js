import { httpFetch } from '../../request'
import { weapi } from './utils/crypto'

// resolution: 1080, 720, 480, 240，越大越清晰
const resolutions = [1080, 720, 480, 240]

export default {
  async getMvUrl(mvId, retryNum = 0) {
    if (retryNum > 3) throw new Error('try max num')
    const resolution = resolutions[Math.min(retryNum, resolutions.length - 1)]

    const requestObj = httpFetch('https://music.163.com/weapi/song/enhance/play/mv/url', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
        origin: 'https://music.163.com',
      },
      form: weapi({
        id: mvId,
        r: resolution,
      }),
    })
    const { body, statusCode } = await requestObj.promise
    if (statusCode != 200 || body.code !== 200 || !body.data?.url) {
      return this.getMvUrl(mvId, retryNum + 1)
    }
    return {
      url: body.data.url.replace(/^http:/, 'https:'),
    }
  },
}
