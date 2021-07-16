/** @license Kaiku
 * kaiku.ts
 *
 * Copyright (c) 2021 Teemu Pääkkönen
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { CssProperty } from './css-properties'
import { HtmlAttribute } from './html-attributes'
;(() => {
  function __assert(condition: any, message?: string): asserts condition {
    if (!Boolean(condition)) {
      throw new Error(message ?? 'assert')
    }
  }

  const assert: typeof __assert = __DEBUG__ ? __assert : () => undefined

  const TRACKED_EXECUTE = Symbol()
  const REMOVE_DEPENDENCIES = Symbol()
  const UPDATE_DEPENDENCIES = Symbol()

  type State<T> = T & {
    [TRACKED_EXECUTE]: <F extends (...args: any) => any>(
      fn: F,
      ...args: Parameters<F>
    ) => [Set<string>, ReturnType<F>]
    [REMOVE_DEPENDENCIES]: (
      nextDependencies: Set<string>,
      callback: Function
    ) => void
    [UPDATE_DEPENDENCIES]: (
      prevDependencies: Set<string>,
      nextDependencies: Set<string>,
      callback: Function
    ) => void
  }

  type KaikuContext<StateT> = {
    state: State<StateT>
  }

  type RenderableChild = ElementDescriptor | string | number
  type Child = RenderableChild | boolean | null | undefined | Child[]
  type Children = Child[]
  type ComponentPropsBase = { key?: string; children?: Children[] }
  type ComponentFunction<PropsT extends ComponentPropsBase> = (
    props: PropsT
  ) => ElementDescriptor
  type ClassNames = string | { [key: string]: boolean } | ClassNames[]
  type LazyProperty<T> = T | (() => T)

  type KaikuHtmlTagProps = {
    key: string
    style: Partial<Record<CssProperty, LazyProperty<string>>>
    className: LazyProperty<ClassNames>
    onClick: Function
    onInput: Function
    checked: LazyProperty<boolean>
  }

  type HtmlTagProps = Partial<
    Record<
      Exclude<HtmlAttribute, keyof KaikuHtmlTagProps>,
      LazyProperty<string>
    >
  > &
    Partial<KaikuHtmlTagProps>

  const enum ElementDescriptorType {
    HtmlTag,
    Component,
  }

  const enum ElementType {
    HtmlTag,
    Component,
    TextNode,
  }

  type ElementDescriptor<
    PropsT extends ComponentPropsBase = ComponentPropsBase
  > = HtmlTagDescriptor | ComponentDescriptor<PropsT>

  type TagName = keyof HTMLElementTagNameMap

  type HtmlTagDescriptor = {
    type: ElementDescriptorType.HtmlTag
    tag: TagName
    props: HtmlTagProps
    children: Children
  }

  type HtmlTag = {
    type: ElementType.HtmlTag
    tag: TagName
    el: () => HTMLElement
    update: (nextProps: HtmlTagProps, children: Children) => void
    destroy: () => void
  }

  type ComponentDescriptor<
    PropsT extends ComponentPropsBase = ComponentPropsBase
  > = {
    type: ElementDescriptorType.Component
    component: ComponentFunction<PropsT>
    props: PropsT
    children: Children
  }

  type Component<PropsT extends ComponentPropsBase = ComponentPropsBase> = {
    type: ElementType.Component
    component: ComponentFunction<PropsT>
    el: () => HTMLElement
    update: (nextProps: PropsT) => void
    destroy: () => void
  }

  type Element<PropsT extends ComponentPropsBase = ComponentPropsBase> =
    | HtmlTag
    | Component<PropsT>

  type ChildElement = Element | { type: ElementType.TextNode; node: Text }

  const union = <T>(a: Set<T> | T[], b: Set<T> | T[]): Set<T> => {
    const s = setPool.allocate(a)
    for (const v of b) {
      s.add(v)
    }
    return s
  }

  const createSetPool = () => {
    const SET_POOL_MAX_SIZE = 10000
    const pool: Set<any>[] = []
    let restorationSet: Set<any>
    if (__DEBUG__) {
      restorationSet = new Set()
    }

    const illegalInvokation = () => {
      throw new Error('Method of a pooled Set() illegally invoked')
    }

    const allocate = <T>(
      values?: T[] | Set<T> | IterableIterator<T>
    ): Set<T> => {
      const set = pool.pop() ?? new Set()

      if (__DEBUG__) {
        set.add = restorationSet.add
        set.has = restorationSet.has
        set.keys = restorationSet.keys
        set.clear = restorationSet.clear
        set.values = restorationSet.values
        set.delete = restorationSet.delete
        set.forEach = restorationSet.forEach
      }

      if (values) {
        for (const value of values) {
          set.add(value)
        }
      }

      return set
    }

    const free = (set: Set<any>) => {
      assert(set.size === 0)

      if (pool.length > SET_POOL_MAX_SIZE) return

      if (__DEBUG__) {
        set.add = illegalInvokation
        set.has = illegalInvokation
        set.keys = illegalInvokation
        set.clear = illegalInvokation
        set.values = illegalInvokation
        set.delete = illegalInvokation
        set.forEach = illegalInvokation
      }

      pool.push(set)
    }

    return { allocate, free }
  }

  const setPool = createSetPool()

  const createState = <StateT extends object>(
    initialState: StateT
  ): State<StateT> => {
    const IS_WRAPPED = Symbol()
    const trackedDependencyStack: Set<string>[] = []
    let dependencyMap = new Map<string, Set<Function>>()
    let deferredUpdates = setPool.allocate<Function>()
    let deferredUpdateQueued = false

    const deferredUpdate = () => {
      const updates = deferredUpdates
      deferredUpdateQueued = false
      deferredUpdates = setPool.allocate()
      for (const callback of updates) {
        callback()
      }

      updates.clear()
      setPool.free(updates)

      assert(
        !deferredUpdates.size,
        'deferredUpdate(): Side-effects detected in a dependency callback. Ensure all your components have no side-effects in them.'
      )
    }

    const trackedExectute = <F extends (...args: any[]) => any>(
      fn: F,
      ...args: Parameters<F>
    ): [Set<string>, ReturnType<F>] => {
      trackedDependencyStack.push(setPool.allocate())
      const result = fn(...args)
      const dependencies = trackedDependencyStack.pop()

      assert(dependencies)

      return [dependencies, result]
    }

    const removeDependencies = (
      dependencies: Set<string>,
      callback: Function
    ) => {
      for (const depKey of dependencies) {
        const deps = dependencyMap.get(depKey)
        if (deps) {
          deps.delete(callback)
          if (deps.size === 0) {
            setPool.free(deps)
            dependencyMap.delete(depKey)
          }
        }
      }
    }

    const updateDependencies = (
      prevDependencies: Set<string>,
      nextDependencies: Set<string>,
      callback: Function
    ) => {
      for (const depKey of nextDependencies) {
        if (!prevDependencies.has(depKey)) {
          const deps = dependencyMap.get(depKey)
          if (deps) {
            deps.add(callback)
          } else {
            dependencyMap.set(depKey, setPool.allocate([callback]))
          }
        }
      }

      for (const depKey of prevDependencies) {
        if (!nextDependencies.has(depKey)) {
          const deps = dependencyMap.get(depKey)
          if (deps) {
            deps.delete(callback)
            if (deps.size === 0) {
              setPool.free(deps)
              dependencyMap.delete(depKey)
            }
          }
        }
      }
    }

    let nextId = 0
    const wrap = <T extends object>(obj: T) => {
      const id = ++nextId

      const isArray = Array.isArray(obj)

      const proxy = new Proxy(obj, {
        get(target, key) {
          switch (key) {
            case TRACKED_EXECUTE:
              return trackedExectute
            case REMOVE_DEPENDENCIES:
              return removeDependencies
            case UPDATE_DEPENDENCIES:
              return updateDependencies
            case IS_WRAPPED:
              return true
          }

          if (typeof key === 'symbol') {
            return target[key as keyof T]
          }

          if (trackedDependencyStack.length) {
            const dependencyKey = id + '.' + key
            trackedDependencyStack[trackedDependencyStack.length - 1].add(
              dependencyKey
            )
          }

          return target[key as keyof T]
        },

        set(target, _key, value) {
          const key = _key as keyof T

          if (
            !(isArray && key === 'length') &&
            typeof value !== 'object' &&
            target[key] === value
          ) {
            return true
          }

          if (typeof key === 'symbol') {
            target[key] = value
            return true
          }

          const dependencyKey = id + '.' + key

          if (typeof value === 'object' && value[IS_WRAPPED] !== true) {
            target[key] = wrap(value)
          } else {
            target[key] = value
          }

          const callbacks = dependencyMap.get(dependencyKey)
          if (callbacks) {
            if (!deferredUpdateQueued) {
              deferredUpdateQueued = true
              window.queueMicrotask(deferredUpdate)
            }

            for (const callback of callbacks) {
              deferredUpdates.add(callback)
            }
          }

          return true
        },
      })

      // Recursively wrap all fields of the object by invoking the `set()` function
      const keys = Object.keys(obj) as (keyof T)[]
      for (const key of keys) {
        proxy[key] = proxy[key]
      }

      return proxy
    }

    const state = wrap(initialState)

    return state as State<StateT>
  }

  const createEffect = () => {
    let trackStack: boolean[] = []
    let stateStack: State<object>[] = []
    const effectStack: number[][] = []

    const startEffectTracking = (state: State<any>) => {
      stateStack.push(state)
      effectStack.push([])
      trackStack.push(true)
    }

    const stopEffectTracking = (): number[] => {
      const state = stateStack.pop()
      const effectIds = effectStack.pop()
      trackStack.pop()
      assert(state)
      assert(effectIds)

      return effectIds
    }

    const pauseEffectTracking = () => {
      trackStack.push(false)
    }

    const continueEffectTracking = () => {
      trackStack.pop()
    }

    type Effect = {
      state: State<object>
      dependencies: Set<string>
      callback: () => void
    }

    const effects: Map<number, Effect> = new Map()
    let nextId = 0

    const effect = (fn: () => void) => {
      if (!trackStack[trackStack.length - 1]) {
        return
      }

      const id = ++nextId
      const state = stateStack[stateStack.length - 1] as
        | State<object>
        | undefined

      assert(state)

      const run = () => {
        const eff = effects.get(id)
        assert(eff)

        const [nextDependencies] = state[TRACKED_EXECUTE](fn)
        state[UPDATE_DEPENDENCIES](eff.dependencies, nextDependencies, run)

        eff.dependencies.clear()
        setPool.free(eff.dependencies)

        eff.dependencies = nextDependencies
      }

      effects.set(id, {
        state,
        dependencies: setPool.allocate(),
        callback: run,
      })
      effectStack[effectStack.length - 1].push(id)

      run()
    }

    const unregisterEffects = (effectIds: number[]) => {
      for (let id; (id = effectIds.pop()) !== undefined; ) {
        const eff = effects.get(id)
        assert(eff)

        eff.state[REMOVE_DEPENDENCIES](eff.dependencies, eff.callback)
        eff.dependencies.clear()
        setPool.free(eff.dependencies)
        effects.delete(id)
      }
    }

    return {
      startEffectTracking,
      stopEffectTracking,
      unregisterEffects,
      effect,
      pauseEffectTracking,
      continueEffectTracking,
    }
  }

  const {
    startEffectTracking,
    stopEffectTracking,
    continueEffectTracking,
    pauseEffectTracking,
    unregisterEffects,
    effect,
  } = createEffect()

  const createComponentDescriptor = <PropsT>(
    component: ComponentFunction<PropsT>,
    props: PropsT,
    children: Children
  ): ComponentDescriptor<PropsT> => {
    return {
      type: ElementDescriptorType.Component,
      component,
      props,
      children,
    }
  }

  const createComponent = <PropsT, StateT>(
    descriptor: ComponentDescriptor<PropsT>,
    context: KaikuContext<StateT>
  ): Component<PropsT> => {
    let dependencies = setPool.allocate<string>()
    let prevLeaf: Element | null = null
    let prevProps: PropsT = descriptor.props
    let effects: number[] | null = null

    const update = (nextProps: PropsT = prevProps) => {
      if (nextProps !== prevProps) {
        const properties = union(
          Object.keys(nextProps),
          Object.keys(prevProps)
        ) as Set<keyof PropsT>

        let unchanged = true
        for (const property of properties) {
          if (nextProps[property] !== prevProps[property]) {
            unchanged = false
            break
          }
        }

        if (unchanged) {
          prevProps = nextProps
          return
        }
      }

      if (!effects) {
        startEffectTracking(context.state)
      } else {
        pauseEffectTracking()
      }

      const [nextDependencies, leafDescriptor] = context.state[TRACKED_EXECUTE](
        descriptor.component,
        nextProps
      )
      context.state[UPDATE_DEPENDENCIES](dependencies, nextDependencies, update)

      dependencies = nextDependencies
      prevProps = nextProps

      if (!effects) {
        effects = stopEffectTracking()
      } else {
        continueEffectTracking()
      }

      const wasReused = prevLeaf && reuseChildElement(prevLeaf, leafDescriptor)
      if (wasReused) return

      if (prevLeaf) {
        prevLeaf.destroy()
      }

      prevLeaf = createElement(leafDescriptor, context)
    }

    const destroy = () => {
      assert(prevLeaf)
      assert(effects)

      prevLeaf.destroy()
      unregisterEffects(effects)
      context.state[REMOVE_DEPENDENCIES](dependencies, update)
      dependencies.clear()
      setPool.free(dependencies)
    }

    update()

    const el = () => prevLeaf!.el()

    return {
      type: ElementType.Component,
      component: descriptor.component,
      el,
      update,
      destroy,
    }
  }

  const createHtmlTagDescriptor = (
    tag: TagName,
    props: HtmlTagProps,
    children: Children
  ): HtmlTagDescriptor => {
    return {
      type: ElementDescriptorType.HtmlTag,
      tag,
      props,
      children,
    }
  }

  const stringifyClassNames = (names: ClassNames): string => {
    if (typeof names === 'string') {
      return names
    }

    if (Array.isArray(names)) {
      return names.map((name) => stringifyClassNames(name)).join(' ')
    }

    let className = ''
    const keys = Object.keys(names)
    for (const key of keys) {
      if (names[key]) className += key
    }
    return className
  }

  const longestCommonSubsequence = <T>(a: T[], b: T[]): T[] => {
    const C: number[] = Array(a.length * b.length).fill(0)

    const ix = (i: number, j: number) => i * b.length + j

    for (let i = 0; i < a.length; i++) {
      for (let j = 0; j < b.length; j++) {
        if (a[i] === b[j]) {
          C[ix(i + 1, j + 1)] = C[ix(i, j)] + 1
        } else {
          C[ix(i + 1, j + 1)] = Math.max(C[ix(i + 1, j)], C[ix(i, j + 1)])
        }
      }
    }

    const res: T[] = []

    let i = a.length
    let j = b.length

    while (i && j) {
      if (a[i - 1] === b[j - 1]) {
        res.push(a[i - 1])
        i--
        j--
        continue
      }

      if (C[ix(i, j - 1)] > C[ix(i - 1, j)]) {
        j--
      } else {
        i--
      }
    }

    return res.reverse()
  }

  const flattenChildren = (
    children: Children,
    keyPrefix: string = '',
    result: Map<string, RenderableChild> = new Map()
  ): Map<string, RenderableChild> => {
    for (let i = 0; i < children.length; i++) {
      const child = children[i]

      if (
        child === null ||
        typeof child === 'boolean' ||
        typeof child === 'undefined'
      ) {
        continue
      }

      if (Array.isArray(child)) {
        flattenChildren(child, i + '.', result)
        continue
      }

      if (typeof child === 'string' || typeof child === 'number') {
        result.set(keyPrefix + i, child)
        continue
      }

      result.set(
        keyPrefix +
          (typeof child.props.key !== 'undefined' ? '_' + child.props.key : i),
        child
      )
    }

    return result
  }

  const reuseChildElement = (
    prevChild: ChildElement,
    nextChild: RenderableChild
  ): boolean => {
    if (typeof nextChild === 'string' || typeof nextChild === 'number') {
      if (prevChild.type === ElementType.TextNode) {
        const value = String(nextChild)
        if (prevChild.node.data !== value) {
          prevChild.node.data = value
        }
        return true
      }
      return false
    }

    if (
      nextChild.type === ElementDescriptorType.HtmlTag &&
      prevChild.type === ElementType.HtmlTag &&
      nextChild.tag === prevChild.tag
    ) {
      prevChild.update(nextChild.props, nextChild.children)
      return true
    }

    if (
      nextChild.type === ElementDescriptorType.Component &&
      prevChild.type === ElementType.Component &&
      prevChild.component === prevChild.component
    ) {
      prevChild.update(nextChild.props)
      return true
    }

    return false
  }

  const getNodeOfChildElement = (child: ChildElement): HTMLElement | Text =>
    child.type === ElementType.TextNode ? child.node : child.el()

  const createHtmlTag = <StateT>(
    descriptor: HtmlTagDescriptor,
    context: KaikuContext<StateT>
  ): HtmlTag => {
    let previousChildren: Map<string, ChildElement> = new Map()
    let previousKeys: string[] = []
    let prevProps: HtmlTagProps = {}
    let lazyUpdates: (() => void)[] = []

    const element = document.createElement(descriptor.tag)

    const lazy = <T>(prop: LazyProperty<T>, handler: (value: T) => void) => {
      if (typeof prop !== 'function') {
        handler(prop)
        return
      }

      let dependencies = setPool.allocate<string>()

      const run = () => {
        const [nextDependencies, value] = context.state[TRACKED_EXECUTE](
          prop as () => T
        )
        context.state[UPDATE_DEPENDENCIES](dependencies, nextDependencies, run)
        dependencies.clear()
        setPool.free(dependencies)
        dependencies = nextDependencies
        handler(value)
      }

      run()

      if (dependencies.size === 0) {
        setPool.free(dependencies)
        return
      }
      // TODO: Change this to use system similar to effects
      lazyUpdates.push(() => {
        context.state[REMOVE_DEPENDENCIES](dependencies, run)
      })
    }

    const update = (nextProps: HtmlTagProps, children: Children) => {
      const keys = union(Object.keys(nextProps), Object.keys(prevProps)) as Set<
        keyof HtmlTagProps
      >

      for (let unregister; (unregister = lazyUpdates.pop()); ) {
        unregister()
      }

      for (const key of keys) {
        if (prevProps[key] === nextProps[key]) continue
        if (key === 'key') continue

        const isListener = key.startsWith('on')

        if (isListener) {
          const eventName = key.substr(2).toLowerCase()

          if (key in prevProps) {
            element.removeEventListener(eventName as any, prevProps[key] as any)
          }

          if (key in nextProps) {
            element.addEventListener(eventName as any, nextProps[key] as any)
          }
        } else {
          switch (key) {
            case 'style': {
              const properties = union(
                Object.keys(nextProps.style || {}),
                Object.keys(prevProps.style || {})
              ) as Set<CssProperty>

              for (const property of properties) {
                if (
                  nextProps.style?.[property] !== prevProps.style?.[property]
                ) {
                  lazy(nextProps.style?.[property] ?? '', (value) => {
                    element.style[property as any] = value
                  })
                }
              }
              continue
            }
            case 'checked': {
              lazy(nextProps.checked, (value) => {
                ;(element as HTMLInputElement).checked = value as boolean
              })
              continue
            }
            case 'value': {
              lazy(nextProps[key] ?? '', (value) => {
                ;(element as HTMLInputElement).value = value
              })
              continue
            }
            case 'className': {
              lazy(nextProps[key], (value) => {
                element.setAttribute('class', stringifyClassNames(value ?? ''))
              })
              continue
            }
          }

          if (key in nextProps) {
            lazy(nextProps[key] as LazyProperty<string>, (value) => {
              element.setAttribute(key, value)
            })
          } else {
            element.removeAttribute(key)
          }
        }
      }

      prevProps = nextProps

      const flattenedChildren = flattenChildren(children)
      const nextKeysIterator = flattenedChildren.keys()
      const nextKeysArr = Array.from(nextKeysIterator)
      const nextKeys = setPool.allocate(nextKeysArr)
      const preservedElements = setPool.allocate(
        longestCommonSubsequence(previousKeys, nextKeysArr)
      )

      for (const key of preservedElements) {
        const nextChild = flattenedChildren.get(key)
        const prevChild = previousChildren.get(key)

        assert(typeof nextChild !== 'undefined')
        assert(prevChild)

        const wasReused = reuseChildElement(prevChild, nextChild)

        if (!wasReused) {
          preservedElements.delete(key)
        }
      }

      for (const key of nextKeys) {
        if (preservedElements.has(key)) continue

        const nextChild = flattenedChildren.get(key)
        const prevChild = previousChildren.get(key)

        assert(typeof nextChild !== 'undefined')

        const wasReused = prevChild && reuseChildElement(prevChild, nextChild)

        if (!wasReused) {
          if (typeof nextChild === 'number' || typeof nextChild === 'string') {
            const node = document.createTextNode(String(nextChild))
            previousChildren.set(key, {
              type: ElementType.TextNode,
              node,
            })
            continue
          }

          previousChildren.set(key, createElement(nextChild, context))
        }
      }

      for (let i = nextKeysArr.length - 1; i >= 0; i--) {
        const key = nextKeysArr[i]
        const prevKey = nextKeysArr[i + 1]

        if (preservedElements.has(key)) continue

        const child = previousChildren.get(key)
        assert(child)
        const node = getNodeOfChildElement(child)
        if (!prevKey) {
          element.appendChild(node)
        } else {
          const beforeChild = previousChildren.get(prevKey)
          assert(beforeChild)
          const beforeNode = getNodeOfChildElement(beforeChild)
          element.insertBefore(node, beforeNode)
        }
      }

      for (const [key, child] of previousChildren) {
        if (!nextKeys.has(key)) {
          if (child.type === ElementType.TextNode) {
            element.removeChild(child.node)
          } else {
            child.destroy()
            element.removeChild(child.el())
          }
          previousChildren.delete(key)
        }
      }
      nextKeys.clear()
      preservedElements.clear()
      setPool.free(nextKeys)
      setPool.free(preservedElements)
      previousKeys = nextKeysArr
    }

    const destroy = () => {
      for (let unregister; (unregister = lazyUpdates.pop()); ) {
        unregister()
      }

      for (const child of previousChildren.values()) {
        if (child.type === ElementType.TextNode) {
          element.removeChild(child.node)
        } else {
          child.destroy()
          element.removeChild(child.el())
        }
      }

      previousChildren.clear()
    }

    const el = () => element

    update(descriptor.props, descriptor.children)

    return {
      type: ElementType.HtmlTag,
      tag: descriptor.tag,
      el,
      destroy,
      update,
    }
  }

  const createElement = <PropsT, StateT>(
    descriptor: ElementDescriptor<PropsT>,
    context: KaikuContext<StateT>
  ): Element<PropsT> => {
    if (descriptor.type === ElementDescriptorType.Component) {
      return createComponent(descriptor, context)
    }
    return createHtmlTag(descriptor, context)
  }

  function h(
    tag: string,
    props: HtmlTagProps | null,
    ...children: Children
  ): HtmlTagDescriptor
  function h<PropsT>(
    component: ComponentFunction<PropsT>,
    props: PropsT | null,
    ...children: Children
  ): ComponentDescriptor<PropsT>
  function h(tagOrComponent: any, props: any, ...children: any) {
    assert(
      typeof tagOrComponent === 'string' || typeof tagOrComponent === 'function'
    )

    switch (typeof tagOrComponent) {
      case 'function': {
        return createComponentDescriptor(tagOrComponent, props ?? {}, children)
      }

      case 'string': {
        return createHtmlTagDescriptor(
          tagOrComponent as TagName,
          props ?? {},
          children
        )
      }
    }
  }

  const render = <PropsT, StateT>(
    rootDescriptor: ElementDescriptor<PropsT>,
    state: State<StateT>,
    rootElement: HTMLElement
  ) => {
    const element = createElement<PropsT, StateT>(rootDescriptor, { state })
    rootElement.appendChild(element.el())
  }

  const kaiku = {
    h,
    render,
    createState,
    effect,
  }

  if (typeof module !== 'undefined') {
    module.exports = kaiku
  } else {
    ;(self as any).kaiku = kaiku
  }
})()
