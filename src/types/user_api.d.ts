declare namespace LX {
  namespace UserApi {
    type UserApiSourceInfoType = 'music'
    type UserApiSourceInfoActions = 'musicUrl' | 'lyric' | 'pic'

    interface UserApiSourceInfo {
      name: string
      type: UserApiSourceInfoType
      actions: UserApiSourceInfoActions[]
      qualitys: LX.Quality[]
    }

    type UserApiSources = Record<LX.Source, UserApiSourceInfo>


    interface UserApiInfo {
      id: string
      name: string
      description: string
      // script: string
      allowShowUpdateAlert: boolean
      author: string
      homepage: string
      version: string
      sources?: UserApiSources
      groupId?: string // 聚合导入的分组 id，独立导入的源无此字段
    }

    interface UserApiStatus {
      status: boolean
      message?: string
      apiInfo?: UserApiInfo
    }

    interface UserApiUpdateInfo {
      name: string
      description: string
      log: string
      updateUrl?: string
    }

    interface UserApiRequestParams {
      requestKey: string
      data: any
    }
    interface UserApiRequestParams {
      requestKey: string
      data: any
    }
    type UserApiRequestCancelParams = string
    type UserApiSetApiParams = string

    interface UserApiSetAllowUpdateAlertParams {
      id: string
      enable: boolean
    }

    interface ImportUserApi {
      apiInfo: UserApiInfo
      apiList: UserApiInfo[]
    }

    /** 聚合源清单：远端 JSON，一次描述多个自定义源的来源 */
    interface UserApiGroupManifest {
      version: string
      name: string
      sources: Array<{ url: string, name?: string }>
    }

    /** 聚合分组信息：一次聚合导入产生的分组记录 */
    interface UserApiGroupInfo {
      id: string
      name: string
      url: string
      version: string
      apiIds: string[]
      lastCheckTime: number
    }

    interface ImportUserApiGroup {
      groupInfo: UserApiGroupInfo
      succeededCount: number
      failedCount: number
      failed: Array<{ url: string, message: string }>
    }

  }
}
