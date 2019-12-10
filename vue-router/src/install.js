import View from './components/view'
import Link from './components/link'

// export一个vue的原因是可以不将vue打包进插件中而使用vue的一些方法
// 只能在install之后才会存在这个vue的实例
export let _Vue
/**
 * 该方法主要做了三件事
 * 1.对Vue实例混入beforeCreate钩子操作 （在vue的生命周期阶段会被调用）
 * 2.通过Vue.prototype定义router和route 属性 （方便所有组件可以获取两个属性）
 * 3.Vue上注册router-view 和 router-link两个组件
 */


export function install (Vue) {
  // 如果已经安装 就return
  if (install.installed && _Vue === Vue) return
  install.installed = true
  // 私有化vue  方便引用
  _Vue = Vue

  const isDef = v => v !== undefined

  const registerInstance = (vm, callVal) => {
    let i = vm.$options._parentVnode
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
      i(vm, callVal)
    }
  }

  Vue.mixin({
    // 钩子函数
    beforeCreate () {
      // router不为空  首次进入初始化路由
      // this.$options.router为vueRouter实例
      // 这里判断是否已经挂载
      // 验证vue是否有router对象了，如果有，就不再初始化了
      if (isDef(this.$options.router)) { // 没有router对象
        // 将_routerRoot指向根组件
        this._routerRoot = this
        // 将router对象挂载到根组件元素_router上
        this._router = this.$options.router
        // router初始化 建立路由监控 调用VueRouter的init方法
        this._router.init(this)
        // 劫持数据_route  一旦_route数据发生变化 通知router-view执行render函数
        // 监控_route数据变化 这里为更新router-view
        Vue.util.defineReactive(this, '_route', this._router.history.current)
      } else {
        // 把每一个组件的_routerRoot都指向Vue实例 方便访问router信息
        // 如果有router对象，去寻找根组件，将_routerRoot指向根组件（解决嵌套关系时_routerRoot指向不一致的问题）
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
      }
      // 注册VueComponent 进行响应化处理
      registerInstance(this, this)
    },
    destroyed () {
      // 注销VueComponent
      registerInstance(this)
    }
  })
  // _router 为VueRouter的实例
  // 响应化 $router  $router访问的是根组件的_router
  Object.defineProperty(Vue.prototype, '$router', {
    get () { return this._routerRoot._router }
  })
  // _route 为一个存储了路由数据的对象
  // 响应化 $route  $route访问的是根组件的_route
  Object.defineProperty(Vue.prototype, '$route', {
    get () { return this._routerRoot._route }
  })
  // 注册router-view 和 router-link 组件
  Vue.component('RouterView', View)
  Vue.component('RouterLink', Link)

  const strats = Vue.config.optionMergeStrategies
  // use the same hook merging strategy for route hooks
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
}
