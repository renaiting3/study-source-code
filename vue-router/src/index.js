/* @flow */

import { install } from './install'
import { START } from './util/route'
import { assert } from './util/warn'
import { inBrowser } from './util/dom'
import { cleanPath } from './util/path'
import { createMatcher } from './create-matcher'
import { normalizeLocation } from './util/location'
import { supportsPushState } from './util/push-state'

import { HashHistory } from './history/hash'
import { HTML5History } from './history/html5'
import { AbstractHistory } from './history/abstract'

import type { Matcher } from './create-matcher'

/**
 * 参考：
 * https://blog.csdn.net/u013938465/article/details/79421239
 * https://segmentfault.com/a/1190000020245449?utm_source=tag-newest#item-2-5
 * https://segmentfault.com/a/1190000013177857
 * https://github.com/SHERlocked93/vue-router-analysis
 */


/**
 * 生成实例过程中，主要做了以下两件事
 * 1、根据配置数组（传入的routes）生成路由配置表
 * 2、根据不同模式生成监控路由变化的history对象
 * 注：History类由HTML5History、hashHistory、AbstractHistory三类继承
 * history/base.js 实现了基本history操作
 * history/html5.js、history/hash.js、history/abstract.js继承了base，只是根据不同的模式封装了一些基本操作
 */

export default class VueRouter {
  static install: () => void;
  static version: string;

  app: any;
  apps: Array<any>;
  ready: boolean;
  readyCbs: Array<Function>;
  options: RouterOptions;
  mode: string;
  history: HashHistory | HTML5History | AbstractHistory;
  matcher: Matcher;
  fallback: boolean;
  beforeHooks: Array<?NavigationGuard>;
  resolveHooks: Array<?NavigationGuard>;
  afterHooks: Array<?AfterNavigationHook>;

  constructor (options: RouterOptions = {}) {
    // 当前Vue实例
    this.app = null
    // 所有app组件
    this.apps = []
    // vueRouter的配置项
    this.options = options
    // 三个钩子
    this.beforeHooks = []
    this.resolveHooks = []
    this.afterHooks = []
    // 创建路由匹配实例：传入我们的routes,包含path和component对象
    this.matcher = createMatcher(options.routes || [], this) // 生成匹配表
    // 路由模式
    let mode = options.mode || 'hash'
    // 兼容低版本不支持history模式 如果不支持 回退到hash模式
    this.fallback = mode === 'history' && !supportsPushState && options.fallback !== false
    if (this.fallback) {
      mode = 'hash'
    }
    // 非浏览器 node运行环境 mode = 'abstract'
    if (!inBrowser) {
      mode = 'abstract'
    }
    this.mode = mode
    // 外观模式
    // 根据模式类型创建不同的history实例
    switch (mode) {
      case 'history':
        this.history = new HTML5History(this, options.base)
        break
      case 'hash':
        this.history = new HashHistory(this, options.base, this.fallback)
        break
      case 'abstract':
        this.history = new AbstractHistory(this, options.base)
        break
      default:
        if (process.env.NODE_ENV !== 'production') {
          assert(false, `invalid mode: ${mode}`)
        }
    }
  }
  // createMatcher.js 返回的match方法
  match (
    raw: RawLocation,
    current?: Route,
    redirectedFrom?: Location
  ): Route {
    return this.matcher.match(raw, current, redirectedFrom)
  }
  // 当前路由对象
  get currentRoute (): ?Route {
    return this.history && this.history.current
  }
  // 初始化 install.js 会调用该方法进行初始化
  init (app: any /* Vue component instance */) {
    process.env.NODE_ENV !== 'production' && assert(
      install.installed,
      `not installed. Make sure to call \`Vue.use(VueRouter)\` ` +
      `before creating root instance.`
    )
    // app 指的是我们实例化的Vue实例
    this.apps.push(app)

    // set up app destroyed handler
    // https://github.com/vuejs/vue-router/issues/2639
    app.$once('hook:destroyed', () => {
      // clean out app from this.apps array once destroyed
      const index = this.apps.indexOf(app)
      if (index > -1) this.apps.splice(index, 1)
      // ensure we still have a main app or null if no apps
      // we do not release the router so it can be reused
      if (this.app === app) this.app = this.apps[0] || null
    })
    // 主程序已经初始化 不需要再重新初始化
    // main app previously initialized
    // return as we don't need to set up new history listener
    if (this.app) {
      return
    }
    // 初次初始化 将VueRouter内的app指向Vue实例
    this.app = app

    const history = this.history
    // 针对HTML5History 和 HashHistory 特殊处理
    // 因为在这两种模式下才有可能存在进入时候不是默认页
    // 需要根据当前浏览器地址栏里面path和hash来激活对应的路由
    // 通过hstory的transitionTo方法来达到目的
    if (history instanceof HTML5History) {
      // HTML5History  transitionTo
      history.transitionTo(history.getCurrentLocation())
    } else if (history instanceof HashHistory) {
      // 建立hash监听
      const setupHashListener = () => {
        history.setupListeners()
      }
      // HashHistory  transitionTo
      history.transitionTo(
        history.getCurrentLocation(),
        setupHashListener,
        setupHashListener
      )
    }
    // 设置路由改变时候的监听
    history.listen(route => {
      this.apps.forEach((app) => {
        app._route = route
      })
    })
  }
  // 导航守卫 全局前置守卫 beforeHooks
  beforeEach (fn: Function): Function {
    return registerHook(this.beforeHooks, fn)
  }
  // 导航守卫 全局解析守卫 resolveHooks
  beforeResolve (fn: Function): Function {
    return registerHook(this.resolveHooks, fn)
  }
  // 导航守卫 全局后置守卫 afterHooks
  afterEach (fn: Function): Function {
    return registerHook(this.afterHooks, fn)
  }
  // 路由完成初始化导航时调用 onReady事件
  onReady (cb: Function, errorCb?: Function) {
    this.history.onReady(cb, errorCb)
  }
  // 路由导航过程中错误被调用 onError事件
  onError (errorCb: Function) {
    this.history.onError(errorCb)
  }
  // 访问路由实例 跳转页面 this.$router.push
  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    // $flow-disable-line
    if (!onComplete && !onAbort && typeof Promise !== 'undefined') {
      return new Promise((resolve, reject) => {
        this.history.push(location, resolve, reject)
      })
    } else {
      this.history.push(location, onComplete, onAbort)
    }
  }
  // 访问路由实例 也能跳转页面  但是不会向history中添加新纪录 而是替换掉当前的history记录
  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    // $flow-disable-line
    if (!onComplete && !onAbort && typeof Promise !== 'undefined') {
      return new Promise((resolve, reject) => {
        this.history.replace(location, resolve, reject)
      })
    } else {
      this.history.replace(location, onComplete, onAbort)
    }
  }
  // 向前n步
  go (n: number) {
    this.history.go(n)
  }
  // 向后一步
  back () {
    this.go(-1)
  }
  // 向前一步
  forward () {
    this.go(1)
  }
  // 获取路由匹配的组件
  getMatchedComponents (to?: RawLocation | Route): Array<any> {
    const route: any = to
      ? to.matched
        ? to
        : this.resolve(to).route
      : this.currentRoute
    if (!route) {
      return []
    }
    // 这个返回的是
    // Object.keys(m.components).map(key => {
    //   return m.components[key]
    // })
    // matched是路由记录的集合 最终返回的是每个路由记录的components属性值的值
    return [].concat.apply([], route.matched.map(m => {
      return Object.keys(m.components).map(key => {
        return m.components[key]
      })
    }))
  }
  // 根据路由对象返回浏览器路径等信息
  resolve (
    to: RawLocation,
    current?: Route,
    append?: boolean
  ): {
    location: Location,
    route: Route,
    href: string,
    // for backwards compat
    normalizedTo: Location,
    resolved: Route
  } {
    current = current || this.history.current
    const location = normalizeLocation(
      to,
      current,
      append,
      this
    )
    const route = this.match(location, current)
    const fullPath = route.redirectedFrom || route.fullPath
    const base = this.history.base
    const href = createHref(base, fullPath, this.mode)
    return {
      location,
      route,
      href,
      // for backwards compat
      normalizedTo: location,
      resolved: route
    }
  }
  // 动态添加路由
  addRoutes (routes: Array<RouteConfig>) {
    this.matcher.addRoutes(routes)
    if (this.history.current !== START) {
      this.history.transitionTo(this.history.getCurrentLocation())
    }
  }
}
/** 钩子注册
 * @param {*} list 
 * @param {*} fn 
 */
function registerHook (list: Array<any>, fn: Function): Function {
  list.push(fn)
  return () => {
    const i = list.indexOf(fn)
    if (i > -1) list.splice(i, 1)
  }
}
// 创建url链接
/**
 * @param {string} base // 路由的base路径
 * @param {string} fullPath // 路由走的全路径
 * @param {*} mode // 路由模式
 */
function createHref (base: string, fullPath: string, mode) {
  // 如果是hash模式 用#拼接
  var path = mode === 'hash' ? '#' + fullPath : fullPath
  return base ? cleanPath(base + '/' + path) : path
}
// 注册install、版本
VueRouter.install = install
VueRouter.version = '__VERSION__'
// 在浏览器直接引用vue-router 自动使用插件该插件
if (inBrowser && window.Vue) {
  window.Vue.use(VueRouter)
}
