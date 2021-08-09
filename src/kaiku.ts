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
  /**
   * NOTES:
   *
   *  - Some functions and members you see here have a underscore
   *    after their name; this does not signify any functional
   *    difference. It is to tell Terser (tool used to minify
   *    the library) that they are not build in methods, and
   *    can be hence renamed.
   *
   *  - Some objects, especially arrays, have a `reused*` prefix.
   *    This signifies that they are reused multiple times across
   *    different components, elements or functions. Be extra cautious
   *    when working with them. Remember asserts if need be!
   */

  function __assert(
    condition: boolean | undefined | object | null,
    message?: string
  ): asserts condition {
    if (!Boolean(condition)) {
      throw new Error(message ?? 'assert')
    }
  }

  const getStack = (): string[] => {
    try {
      throw new Error()
    } catch (err) {
      return err.stack
        .split('\n')
        .map((v: string) => v.trim())
        .slice(2)
    }
  }

  const assert: typeof __assert = __DEBUG__ ? __assert : () => undefined

  const TRACKED_EXECUTE = Symbol()
  const REMOVE_DEPENDENCIES = Symbol()
  const UPDATE_DEPENDENCIES = Symbol()
  const CREATE_LOCAL_STATE = Symbol()
  const IMMUTABLE_FLAG = Symbol()
  const STATE_FLAG = Symbol()
  const CLASS_COMPONENT_FLAG = Symbol()

  type StateInternals = {
    [STATE_FLAG]: true
    [TRACKED_EXECUTE]: <F extends (...args: any) => any>(
      fn: F,
      ...args: Parameters<F>
    ) => [Set<StateKey>, ReturnType<F>]
    [REMOVE_DEPENDENCIES]: (
      nextDependencies: Set<StateKey>,
      callback: Function
    ) => void
    [UPDATE_DEPENDENCIES]: (
      prevDependencies: Set<StateKey>,
      nextDependencies: Set<StateKey>,
      callback: Function
    ) => void
    [CREATE_LOCAL_STATE]: <T extends object>(initialState: T) => State<T>
  }

  type State<T> = T & StateInternals

  type KaikuContext<StateT> = {
    state_: State<StateT>
    queueUpdate: (fn: () => void) => void
    queueMount: (fn: () => void) => void
  }
  type RenderableChild = ElementDescriptor | string | number
  type Child =
    | ElementDescriptor
    | string
    | number
    | boolean
    | null
    | undefined
    | Child[]
    | FunctionComponentFunction<{}>
  type Children = Child[]
  type ComponentPropsBase = {
    key?: string
    ref?: Ref<any>
    children_?: Children[]
  }
  type FunctionComponentFunction<PropsT extends ComponentPropsBase> = (
    props: PropsT
  ) => ElementDescriptor
  type ClassNames = string | { [key: string]: boolean } | ClassNames[]
  type LazyProperty<T> = T | (() => T)

  type KaikuHtmlTagProps = {
    ref: Ref<any>
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
    FunctionComponent,
    ClassComponent,
  }

  const enum ElementType {
    HtmlTag,
    FunctionComponent,
    ClassComponent,
    TextNode,
  }

  type ElementDescriptor<
    PropsT extends ComponentPropsBase = ComponentPropsBase
  > =
    | HtmlTagDescriptor
    | FunctionComponentDescriptor<PropsT>
    | ClassComponentDescriptor<PropsT>

  type TagName = keyof HTMLElementTagNameMap

  type HtmlTagDescriptor = {
    type_: ElementDescriptorType.HtmlTag
    tag_: TagName
    existingElement?: HTMLElement
    props: HtmlTagProps
    children_: Children
  }

  type ClassComponentType<PropsT> = { new (props: PropsT): Component<PropsT> }

  type ClassComponentDescriptor<
    PropsT extends ComponentPropsBase = ComponentPropsBase
  > = {
    type_: ElementDescriptorType.ClassComponent
    class_: ClassComponentType<PropsT>
    props: PropsT
    children_: Children
  }

  type ClassComponent<PropsT extends ComponentPropsBase = ComponentPropsBase> =
    {
      type_: ElementType.ClassComponent
      class_: ClassComponentType<PropsT>
      el: ElementGetter
      update_: (nextProps: PropsT) => void
      destroy: () => void
    }

  type ElementGetter = () => HTMLElement

  type HtmlTag = {
    type_: ElementType.HtmlTag
    tag_: TagName
    el: ElementGetter
    update_: (nextProps: HtmlTagProps, children_: Children) => void
    destroy: () => void
  }

  type FunctionComponentDescriptor<
    PropsT extends ComponentPropsBase = ComponentPropsBase
  > = {
    type_: ElementDescriptorType.FunctionComponent
    componentFn: FunctionComponentFunction<PropsT>
    props: PropsT
    children_: Children
  }

  type FunctionComponent<
    PropsT extends ComponentPropsBase = ComponentPropsBase
  > = {
    type_: ElementType.FunctionComponent
    componentFn: FunctionComponentFunction<PropsT>
    el: ElementGetter
    update_: (nextProps: PropsT) => void
    destroy: () => void
  }

  type Element<PropsT extends ComponentPropsBase = ComponentPropsBase> =
    | HtmlTag
    | FunctionComponent<PropsT>
    | ClassComponent<PropsT>

  type ChildElement = Element | { type_: ElementType.TextNode; node: Text }

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

    const illegalInvokation = (stack: string[]) => () => {
      throw new Error(
        `Method of a pooled Set() illegally invoked. \n=== FREE STACK ===\n${stack.join(
          '\n\t'
        )}\n=== END FREE STACK ===`
      )
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
        set.add =
          set.has =
          set.keys =
          set.clear =
          set.values =
          set.delete =
          set.forEach =
            illegalInvokation(getStack())
      }

      pool.push(set)
    }

    return { allocate, free }
  }

  const setPool = createSetPool()

  type StateKey = string & { __: 'StateKey' }

  const createState = <StateT extends object>(
    initialState: StateT
  ): State<StateT> => {
    let nextObjectId = 0
    const trackedDependencyStack: Set<StateKey>[] = []
    let dependencyMap = new Map<StateKey, Set<Function>>()
    let deferredUpdates = new Set<Function>()
    let deferredUpdateQueued = false

    const deferredUpdate = () => {
      deferredUpdateQueued = false
      for (const callback of deferredUpdates) {
        const size = deferredUpdates.size
        callback()

        assert(
          size >= deferredUpdates.size,
          'deferredUpdate(): Side-effects detected in a dependency callback. Ensure all your components have no side-effects in them.'
        )

        deferredUpdates.delete(callback)
      }

      assert(
        !deferredUpdates.size,
        'deferredUpdate(): Side-effects detected in a dependency callback. Ensure all your components have no side-effects in them.'
      )
    }

    const reusedReturnTuple: any[] = []
    const trackedExectute = <F extends (...args: any[]) => any>(
      fn: F,
      ...args: Parameters<F>
    ): [Set<StateKey>, ReturnType<F>] => {
      trackedDependencyStack.push(setPool.allocate())
      const result = fn(...args)
      const dependencies = trackedDependencyStack.pop()

      assert(dependencies)

      const ret = reusedReturnTuple as [Set<StateKey>, ReturnType<F>]
      ret[0] = dependencies
      ret[1] = result
      return ret
    }

    const removeDependencies = (
      dependencies: Set<StateKey>,
      callback: Function
    ) => {
      // TODO: Not sure if the necessity of adding this counts as a bug
      // or not.
      deferredUpdates.delete(callback)

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

    const createLocalState = <T extends object>(initialState: T): State<T> => {
      return wrap(initialState)
    }

    const updateDependencies = (
      prevDependencies: Set<StateKey>,
      nextDependencies: Set<StateKey>,
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

    const internals: StateInternals = {
      [STATE_FLAG]: true,
      [TRACKED_EXECUTE]: trackedExectute,
      [REMOVE_DEPENDENCIES]: removeDependencies,
      [UPDATE_DEPENDENCIES]: updateDependencies,
      [CREATE_LOCAL_STATE]: createLocalState,
    }

    const wrap = <T extends object>(obj: T): State<T> => {
      const id = ++nextObjectId

      const isArray = Array.isArray(obj)

      const proxy = new Proxy(obj, {
        get(target, key) {
          if (key in internals) return internals[key as keyof typeof internals]

          if (typeof key === 'symbol') {
            return target[key as keyof T]
          }

          if (trackedDependencyStack.length) {
            const dependencyKey = (id + '.' + key) as StateKey
            trackedDependencyStack[trackedDependencyStack.length - 1].add(
              dependencyKey
            )
          }

          const value = target[key as keyof T]

          if (!isArray && typeof value === 'function') {
            return value.bind(target)
          }

          return value
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

          if (
            value !== null &&
            typeof value === 'object' &&
            !(value[STATE_FLAG] as boolean) &&
            !(value[IMMUTABLE_FLAG] as boolean)
          ) {
            target[key] = wrap(value)
          } else {
            target[key] = value
          }

          const dependencyKey = (id + '.' + key) as StateKey
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

      return proxy as State<T>
    }

    return wrap(initialState)
  }

  const immutable = <T extends object>(obj: T) => {
    return new Proxy(obj, {
      get(target, _key) {
        const key = _key as keyof T

        if (key === IMMUTABLE_FLAG) {
          return true
        }

        return target[key]
      },
    })
  }

  type Ref<T> = {
    current?: T
  }

  type FunctionComponentId = number & { __: 'FunctionComponentId' }

  // Hooks and their internal state
  const effects = new Map<FunctionComponentId, Effect[]>()
  const componentStates = new Map<FunctionComponentId, State<any>[]>()
  const componentStateIndexStack: number[] = []

  const componentIdStack: FunctionComponentId[] = []
  const stateStack: State<object>[] = []
  const componentsThatHaveUpdatedAtLeastOnce = new Set<FunctionComponentId>()

  type Effect = {
    state_: State<object>
    dependencies: Set<StateKey>
    callback: () => void
  }

  const startHookTracking = (
    componentId: FunctionComponentId,
    state: State<any>
  ) => {
    stateStack.push(state)
    componentIdStack.push(componentId)
    componentStateIndexStack.push(0)
  }

  const stopHookTracking = () => {
    const state = stateStack.pop()
    assert(state)

    const refIndex = componentStateIndexStack.pop()
    assert(typeof refIndex !== 'undefined')

    const componentId = componentIdStack.pop()
    assert(typeof componentId !== 'undefined')
    componentsThatHaveUpdatedAtLeastOnce.add(componentId)
  }

  const destroyHooks = (componentId: FunctionComponentId) => {
    componentsThatHaveUpdatedAtLeastOnce.delete(componentId)
    componentStates.delete(componentId)

    const componentEffects = effects.get(componentId)
    if (!componentEffects) return
    effects.delete(componentId)

    for (const effect of componentEffects) {
      effect.state_[REMOVE_DEPENDENCIES](effect.dependencies, effect.callback)
      effect.dependencies.clear()
      setPool.free(effect.dependencies)
    }
  }

  const useEffect = (fn: () => void) => {
    const componentId = componentIdStack[componentIdStack.length - 1]
    assert(typeof componentId !== 'undefined')

    if (componentsThatHaveUpdatedAtLeastOnce.has(componentId)) {
      return
    }

    const state = stateStack[stateStack.length - 1] as State<object> | undefined
    assert(state)

    const run = () => {
      const [nextDependencies] = state[TRACKED_EXECUTE](fn)
      state[UPDATE_DEPENDENCIES](eff.dependencies, nextDependencies, run)

      eff.dependencies.clear()
      setPool.free(eff.dependencies)

      eff.dependencies = nextDependencies
    }

    const eff: Effect = {
      state_: state,
      dependencies: setPool.allocate(),
      callback: run,
    }

    run()

    let componentEffects = effects.get(componentId)
    if (!componentEffects) {
      componentEffects = []
      effects.set(componentId, componentEffects)
    }
    assert(componentEffects)
    componentEffects.push(eff)
  }

  const useState = <T extends object>(initialState: T): State<T> => {
    const componentId = componentIdStack[componentIdStack.length - 1]
    const componentStateIndex = componentStateIndexStack[
      componentStateIndexStack.length - 1
    ]++
    const state = stateStack[stateStack.length - 1] as State<object> | undefined

    assert(state)
    assert(typeof componentId !== 'undefined')

    let states = componentStates.get(componentId)

    if (!states) {
      states = []
      componentStates.set(componentId, states)
    }

    if (states.length > componentStateIndex) {
      return states[componentStateIndex]
    }

    const componentState = state[CREATE_LOCAL_STATE](initialState)

    states.push(componentState)

    return componentState
  }

  const useRef = <T>(initialValue?: T): Ref<T> =>
    useState({ current: initialValue })

  // ClassComponent

  abstract class Component<PropsT> {
    static [CLASS_COMPONENT_FLAG] = true
    state: object = {}
    constructor() {}
    abstract render(props: PropsT): ElementDescriptor
  }

  const createClassComponentDescriptor = <PropsT>(
    component: ClassComponentType<PropsT>,
    props: PropsT,
    children_: Children
  ): ClassComponentDescriptor<PropsT> => {
    return {
      type_: ElementDescriptorType.ClassComponent,
      class_: component,
      props,
      children_,
    }
  }

  const createClassComponent = <PropsT extends ComponentPropsBase, StateT>(
    descriptor: ClassComponentDescriptor<PropsT>,
    context: KaikuContext<StateT>,
    key: ChildKey,
    remount: Remount
  ): ClassComponent<PropsT> => {
    const instance = new descriptor.class_(descriptor.props)
    instance.render = instance.render.bind(instance)
    instance.state = context.state_[CREATE_LOCAL_STATE](instance.state)

    // Only used for debugging, don't rely on this. It should be dropped
    // in production builds.
    let destroyed = false

    let dependencies = setPool.allocate<StateKey>()
    let currentLeaf: Element | null = null
    let currentProps: PropsT = descriptor.props
    let nextLeafDescriptor: ElementDescriptor | null = null

    let previousLeafEl: HTMLElement | null = null

    const update_ = (nextProps: PropsT = currentProps) => {
      assert(!destroyed, 'update() called even after component was destroyed')

      if (nextProps !== currentProps) {
        const properties = union(
          Object.keys(nextProps),
          Object.keys(currentProps)
        ) as Set<keyof PropsT>

        let unchanged = true
        for (const property of properties) {
          if (nextProps[property] !== currentProps[property]) {
            unchanged = false
            break
          }
        }

        if (unchanged) {
          currentProps = nextProps
          return
        }

        if ('ref' in nextProps) {
          nextProps.ref!.current = instance
        }
      }

      const [nextDependencies, leafDescriptor] = context.state_[
        TRACKED_EXECUTE
      ](instance.render, nextProps)

      nextLeafDescriptor = leafDescriptor
      context.state_[UPDATE_DEPENDENCIES](
        dependencies,
        nextDependencies,
        update_
      )

      dependencies.clear()
      setPool.free(dependencies)
      dependencies = nextDependencies
      currentProps = nextProps

      context.queueUpdate(updateLeaf)
    }

    const remountSelf = () => {
      assert(previousLeafEl)
      assert(currentLeaf)
      remount(key, previousLeafEl, currentLeaf.el())
      if (__DEBUG__) {
        previousLeafEl = null
      }
    }

    const updateLeaf = () => {
      assert(nextLeafDescriptor)
      const wasReused =
        currentLeaf && reuseChildElement(currentLeaf, nextLeafDescriptor)

      if (wasReused) return

      if (!currentLeaf) {
        currentLeaf = createElement(nextLeafDescriptor, context, key, remount)
        return
      }

      // Destroy and remount the leaf if it was not reused and
      // this is not the initialization run
      previousLeafEl = currentLeaf.el()
      currentLeaf.destroy()
      currentLeaf = createElement(nextLeafDescriptor, context, key, remount)
      context.queueMount(remountSelf)
    }

    const destroy = () => {
      assert(currentLeaf)
      assert(effects)

      // This `if` is to ensure the `destroyed` flag is dropped in
      // production builds.
      if (__DEBUG__) {
        assert(!destroyed)
        destroyed = true
      }

      currentLeaf.destroy()
      context.state_[REMOVE_DEPENDENCIES](dependencies, update_)
      dependencies.clear()
      setPool.free(dependencies)
    }

    update_()

    const el = () => {
      assert(currentLeaf)
      return currentLeaf.el()
    }

    return {
      type_: ElementType.ClassComponent,
      class_: descriptor.class_,
      el,
      update_,
      destroy,
    }
  }

  // FunctionComponents and HTML rendering
  let nextFunctionComponentId: FunctionComponentId = 0 as FunctionComponentId

  const createFunctionComponentDescriptor = <PropsT>(
    component: FunctionComponentFunction<PropsT>,
    props: PropsT,
    children_: Children
  ): FunctionComponentDescriptor<PropsT> => {
    return {
      type_: ElementDescriptorType.FunctionComponent,
      componentFn: component,
      props,
      children_,
    }
  }

  const createFunctionComponent = <PropsT, StateT>(
    descriptor: FunctionComponentDescriptor<PropsT>,
    context: KaikuContext<StateT>,
    key: ChildKey,
    remount: Remount
  ): FunctionComponent<PropsT> => {
    const id: FunctionComponentId =
      ++nextFunctionComponentId as FunctionComponentId

    // Only used for debugging, don't rely on this. It should be dropped
    // in production builds.
    let destroyed = false

    let dependencies = setPool.allocate<StateKey>()
    let currentLeaf: Element | null = null
    let currentProps: PropsT = descriptor.props
    let nextLeafDescriptor: ElementDescriptor | null = null

    let previousLeafEl: HTMLElement | null = null

    const update_ = (nextProps: PropsT = currentProps) => {
      assert(!destroyed, 'update() called even after component was destroyed')

      if (nextProps !== currentProps) {
        const properties = union(
          Object.keys(nextProps),
          Object.keys(currentProps)
        ) as Set<keyof PropsT>

        let unchanged = true
        for (const property of properties) {
          if (nextProps[property] !== currentProps[property]) {
            unchanged = false
            break
          }
        }

        if (unchanged) {
          currentProps = nextProps
          return
        }
      }

      startHookTracking(id, context.state_)
      const [nextDependencies, leafDescriptor] = context.state_[
        TRACKED_EXECUTE
      ](descriptor.componentFn, nextProps)
      stopHookTracking()

      nextLeafDescriptor = leafDescriptor
      context.state_[UPDATE_DEPENDENCIES](
        dependencies,
        nextDependencies,
        update_
      )

      dependencies.clear()
      setPool.free(dependencies)
      dependencies = nextDependencies
      currentProps = nextProps

      context.queueUpdate(updateLeaf)
    }

    const remountSelf = () => {
      assert(previousLeafEl)
      assert(currentLeaf)
      remount(key, previousLeafEl, currentLeaf.el())
      if (__DEBUG__) {
        previousLeafEl = null
      }
    }

    const updateLeaf = () => {
      assert(nextLeafDescriptor)
      const wasReused =
        currentLeaf && reuseChildElement(currentLeaf, nextLeafDescriptor)

      if (wasReused) return

      if (!currentLeaf) {
        currentLeaf = createElement(nextLeafDescriptor, context, key, remount)
        return
      }

      // Destroy and remount the leaf if it was not reused and
      // this is not the initialization run
      previousLeafEl = currentLeaf.el()
      currentLeaf.destroy()
      currentLeaf = createElement(nextLeafDescriptor, context, key, remount)
      context.queueMount(remountSelf)
    }

    const destroy = () => {
      assert(currentLeaf)
      assert(effects)

      // This `if` is to ensure the `destroyed` flag is dropped in
      // production builds.
      if (__DEBUG__) {
        assert(!destroyed)
        destroyed = true
      }

      destroyHooks(id)
      currentLeaf.destroy()
      context.state_[REMOVE_DEPENDENCIES](dependencies, update_)
      dependencies.clear()
      setPool.free(dependencies)
    }

    update_()

    const el = () => {
      assert(currentLeaf)
      return currentLeaf.el()
    }

    return {
      type_: ElementType.FunctionComponent,
      componentFn: descriptor.componentFn,
      el,
      update_,
      destroy,
    }
  }

  const createHtmlTagDescriptor = (
    tag_: TagName,
    props: HtmlTagProps,
    children_: Children
  ): HtmlTagDescriptor => {
    return {
      type_: ElementDescriptorType.HtmlTag,
      tag_,
      props,
      children_,
    }
  }

  const stringifyClassNames = (names: ClassNames): string => {
    if (typeof names === 'string') {
      return names
    }

    let className = ''

    if (Array.isArray(names)) {
      for (const name of names) {
        className += stringifyClassNames(name) + ' '
      }
      return className.trim()
    }

    const keys = Object.keys(names)
    for (const key of keys) {
      if (names[key]) className += key + ' '
    }
    return className.trim()
  }

  // TODO: Add special cases for short arrays
  const longestCommonSubsequence = <T>(a: T[], b: T[]): T[] => {
    const aLength = a.length
    const bLength = b.length

    if (aLength === 0 || bLength === 0) {
      return []
    }

    if (aLength === 1 || bLength === 1) {
      const smaller = aLength === 1 ? a : b
      const bigger = aLength === 1 ? b : a

      for (let i = 0; i < bigger.length; i++) {
        if (bigger[i] === smaller[0]) return smaller
      }

      return []
    }

    const C: number[] = Array((aLength + 1) * (bLength + 1)).fill(0)

    const ix = (i: number, j: number) => i * bLength + j

    for (let i = 0; i < aLength; i++) {
      for (let j = 0; j < bLength; j++) {
        if (a[i] === b[j]) {
          C[ix(i + 1, j + 1)] = C[ix(i, j)] + 1
        } else {
          C[ix(i + 1, j + 1)] = Math.max(C[ix(i + 1, j)], C[ix(i, j + 1)])
        }
      }
    }

    const res: T[] = []

    let i = aLength
    let j = bLength

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

  const reuseChildElement = (
    prevChild: ChildElement,
    nextChild: RenderableChild
  ): boolean => {
    if (typeof nextChild === 'string' || typeof nextChild === 'number') {
      if (prevChild.type_ === ElementType.TextNode) {
        const value = String(nextChild)
        if (prevChild.node.data !== value) {
          prevChild.node.data = value
        }
        return true
      }
      return false
    }

    if (
      nextChild.type_ === ElementDescriptorType.HtmlTag &&
      prevChild.type_ === ElementType.HtmlTag &&
      nextChild.tag_ === prevChild.tag_
    ) {
      prevChild.update_(nextChild.props, nextChild.children_)
      return true
    }

    if (
      nextChild.type_ === ElementDescriptorType.FunctionComponent &&
      prevChild.type_ === ElementType.FunctionComponent &&
      nextChild.componentFn === prevChild.componentFn
    ) {
      prevChild.update_(nextChild.props)
      return true
    }

    if (
      nextChild.type_ === ElementDescriptorType.ClassComponent &&
      prevChild.type_ === ElementType.ClassComponent &&
      nextChild.class_ === prevChild.class_
    ) {
      prevChild.update_(nextChild.props)
      return true
    }

    return false
  }

  const getNodeOfChildElement = (child: ChildElement): HTMLElement | Text =>
    child.type_ === ElementType.TextNode ? child.node : child.el()

  type LazyUpdate = {
    callback: () => void
    dependencies: Set<StateKey>
  }

  const reusedPrefixStack: string[] = []
  const reusedChildrenStack: Children[] = []
  const reusedIndexStack: number[] = []

  type ChildKey = string & { __: 'ChildKey' }

  type Remount = (
    key: ChildKey,
    prevEl: HTMLElement,
    nextEl: HTMLElement
  ) => void

  const createHtmlTag = <StateT>(
    descriptor: HtmlTagDescriptor,
    context: KaikuContext<StateT>
  ): HtmlTag => {
    const element = descriptor.existingElement
      ? descriptor.existingElement
      : document.createElement(descriptor.tag_)

    let currentChildren: Map<ChildKey, ChildElement> = new Map()
    let currentKeys: ChildKey[] = []
    let currentProps: HtmlTagProps = {}

    let nextChildren: Children | null = null
    let nextKeys: Set<ChildKey> | null = null
    let nextKeysArr: ChildKey[] | null = null
    let deadChildren: ChildElement[] = []
    let preservedElements: Set<ChildKey> | null = null

    let lazyUpdates: LazyUpdate[] = []

    const lazy = <T>(prop: LazyProperty<T>, handler: (value: T) => void) => {
      if (typeof prop !== 'function') {
        handler(prop)
        return
      }

      const run = () => {
        const [nextDependencies, value] = context.state_[TRACKED_EXECUTE](
          prop as () => T
        )
        context.state_[UPDATE_DEPENDENCIES](
          lazyUpdate.dependencies,
          nextDependencies,
          run
        )
        lazyUpdate.dependencies.clear()
        setPool.free(lazyUpdate.dependencies)
        lazyUpdate.dependencies = nextDependencies
        handler(value)
      }

      const lazyUpdate: LazyUpdate = {
        dependencies: setPool.allocate(),
        callback: run,
      }

      run()

      if (lazyUpdate.dependencies.size === 0) {
        setPool.free(lazyUpdate.dependencies)
        return
      }

      lazyUpdates.push(lazyUpdate)
    }

    const destroyLazyUpdates = () => {
      for (let lazyUpdate; (lazyUpdate = lazyUpdates.pop()); ) {
        context.state_[REMOVE_DEPENDENCIES](
          lazyUpdate.dependencies,
          lazyUpdate.callback
        )
        lazyUpdate.dependencies.clear()
        setPool.free(lazyUpdate.dependencies)
      }
    }

    const update_ = (nextProps: HtmlTagProps, children: Children) => {
      const keys = union(
        Object.keys(nextProps),
        Object.keys(currentProps)
      ) as Set<keyof HtmlTagProps>

      destroyLazyUpdates()

      for (const key of keys) {
        // TODO: Special case access to style and classsnames
        if (currentProps[key] === nextProps[key]) continue
        if (key === 'key') continue

        if (key === 'ref') {
          nextProps[key]!.current = element
          continue
        }

        // Probably faster than calling startsWith...
        const isListener = key[0] === 'o' && key[1] === 'n'

        if (isListener) {
          const eventName = key.substr(2).toLowerCase()

          if (key in currentProps) {
            element.removeEventListener(
              eventName as any,
              currentProps[key] as any
            )
          }

          if (key in nextProps) {
            element.addEventListener(eventName as any, nextProps[key] as any)
          }
        } else {
          switch (key) {
            case 'style': {
              const properties = union(
                Object.keys(nextProps.style || {}),
                Object.keys(currentProps.style || {})
              ) as Set<CssProperty>

              for (const property of properties) {
                if (
                  nextProps.style?.[property] !== currentProps.style?.[property]
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
                element.className = stringifyClassNames(value ?? '')
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

      currentProps = nextProps
      nextChildren = children

      context.queueUpdate(updateChildren)
      context.queueMount(mountChildren)
    }

    const flattenChildren = (children: Children, prefix = '') => {
      const flattenedChildren = new Map<ChildKey, RenderableChild>()

      if (__DEBUG__) {
        assert(reusedPrefixStack.length === 0)
        assert(reusedChildrenStack.length === 0)
        assert(reusedIndexStack.length === 0)
      }

      reusedPrefixStack.push(prefix)
      reusedChildrenStack.push(children)
      reusedIndexStack.push(0)

      for (let top = 0; top >= 0; reusedIndexStack[top]++) {
        const i = reusedIndexStack[top]
        const children = reusedChildrenStack[top]
        const keyPrefix = reusedPrefixStack[top]

        if (i == children.length) {
          reusedPrefixStack.pop()
          reusedChildrenStack.pop()
          reusedIndexStack.pop()

          top--
          continue
        }

        const child = children[i]

        if (
          child === null ||
          typeof child === 'boolean' ||
          typeof child === 'undefined'
        ) {
          continue
        }

        if (typeof child === 'string' || typeof child === 'number') {
          const key = (keyPrefix + i) as ChildKey
          flattenedChildren.set(key, child)
          continue
        }

        if (typeof child === 'function') {
          const key = (keyPrefix + i) as ChildKey
          flattenedChildren.set(key, h(child, null))
          continue
        }

        if (Array.isArray(child)) {
          top++
          reusedPrefixStack.push(keyPrefix + i + '.')
          reusedChildrenStack.push(child)

          // This needs to start from -1 as it gets incremented once after
          // the continue statement
          reusedIndexStack.push(-1)
          continue
        }
        const key = (keyPrefix +
          (typeof child.props.key !== 'undefined'
            ? '\u9375' + child.props.key
            : i)) as ChildKey
        flattenedChildren.set(key, child)
      }

      if (__DEBUG__) {
        assert(reusedPrefixStack.length === 0)
        assert(reusedChildrenStack.length === 0)
        assert(reusedIndexStack.length === 0)
      }

      return flattenedChildren
    }

    const updateChildren = () => {
      assert(nextChildren)
      assert(deadChildren.length === 0)

      const flattenedChildren = flattenChildren(nextChildren)

      const nextKeysIterator = flattenedChildren.keys()
      nextKeysArr = Array.from(nextKeysIterator) as ChildKey[]
      nextKeys = setPool.allocate(nextKeysArr)
      preservedElements = setPool.allocate(
        longestCommonSubsequence(currentKeys, nextKeysArr)
      )

      // Check if we can reuse any of the components/elements
      // in the longest preserved key sequence.
      for (const key of preservedElements) {
        const nextChild = flattenedChildren.get(key)
        const prevChild = currentChildren.get(key)

        assert(typeof nextChild !== 'undefined')
        assert(prevChild)

        const wasReused = reuseChildElement(prevChild, nextChild)

        if (!wasReused) {
          // Let's not mark the child as dead yet.
          // It might be reused in the next loop.
          preservedElements.delete(key)
        }
      }

      // Try to reuse old components/elements which share the key.
      // If not reused, mark the previous child for destruction
      // and create a new one in its place.
      for (const [key, nextChild] of flattenedChildren) {
        if (preservedElements.has(key)) continue

        const prevChild = currentChildren.get(key)

        const wasReused = prevChild && reuseChildElement(prevChild, nextChild)

        if (!wasReused) {
          if (prevChild) {
            deadChildren.push(prevChild)
          }

          if (typeof nextChild === 'number' || typeof nextChild === 'string') {
            const node = document.createTextNode(nextChild as string)
            currentChildren.set(key, {
              type_: ElementType.TextNode,
              node,
            })
            continue
          }

          currentChildren.set(
            key,
            createElement(nextChild, context, key, remountChild)
          )
        }
      }

      // Check which children will not be a part of the next render.
      // Mark them for destruction and remove from currentChildren.
      for (const [key, child] of currentChildren) {
        if (!nextKeys.has(key)) {
          deadChildren.push(child)
          currentChildren.delete(key)
        }
      }
    }

    const mountChildren = () => {
      assert(nextKeys)
      assert(nextKeysArr)
      assert(preservedElements)

      for (let child; (child = deadChildren.pop()); ) {
        if (child.type_ === ElementType.TextNode) {
          element.removeChild(child.node)
        } else {
          element.removeChild(child.el())
          child.destroy()
        }
      }

      // Since DOM operations only allow you to append or insertBefore,
      // we must start from the end of the keys.
      for (let i = nextKeysArr.length - 1; i >= 0; i--) {
        const key = nextKeysArr[i]
        const prevKey = nextKeysArr[i + 1]

        if (preservedElements.has(key)) continue

        const child = currentChildren.get(key)
        assert(child)
        const node = getNodeOfChildElement(child)
        if (typeof prevKey === 'undefined') {
          element.appendChild(node)
        } else {
          const beforeChild = currentChildren.get(prevKey)
          assert(beforeChild)
          const beforeNode = getNodeOfChildElement(beforeChild)
          element.insertBefore(node, beforeNode)
        }
      }

      currentKeys = nextKeysArr
      nextKeys.clear()
      preservedElements.clear()
      setPool.free(nextKeys)
      setPool.free(preservedElements)

      if (__DEBUG__) {
        assert(deadChildren.length === 0)

        // Ensure these are not reused
        nextKeys = null
        nextKeysArr = null
        preservedElements = null
      }
    }

    const remountChild: Remount = (
      key: ChildKey,
      prevEl: HTMLElement,
      nextEl: HTMLElement
    ) => {
      const child = currentChildren.get(key)
      const childIndex = currentKeys.indexOf(key)
      const prevKey = currentKeys[childIndex - 1]
      assert(childIndex >= 0)
      assert(child)

      element.removeChild(prevEl)

      if (typeof prevKey === 'undefined') {
        element.appendChild(nextEl)
      } else {
        const beforeChild = currentChildren.get(prevKey)
        assert(beforeChild)
        const beforeNode = getNodeOfChildElement(beforeChild)
        element.insertBefore(nextEl, beforeNode)
      }
    }

    const destroy = () => {
      destroyLazyUpdates()

      for (const child of currentChildren.values()) {
        if (child.type_ === ElementType.TextNode) {
          element.removeChild(child.node)
        } else {
          element.removeChild(child.el())
          child.destroy()
        }
      }
    }

    const el = () => element

    update_(descriptor.props, descriptor.children_)

    return {
      type_: ElementType.HtmlTag,
      tag_: descriptor.tag_,
      el,
      destroy,
      update_,
    }
  }

  const createElement = <PropsT, StateT>(
    descriptor: ElementDescriptor<PropsT>,
    context: KaikuContext<StateT>,
    key?: ChildKey,
    remount?: Remount
  ): Element<PropsT> => {
    if (descriptor.type_ === ElementDescriptorType.FunctionComponent) {
      assert(typeof key !== 'undefined')
      assert(typeof remount !== 'undefined')
      return createFunctionComponent(descriptor, context, key, remount)
    }

    if (descriptor.type_ === ElementDescriptorType.ClassComponent) {
      assert(typeof key !== 'undefined')
      assert(typeof remount !== 'undefined')
      return createClassComponent(descriptor, context, key, remount)
    }

    return createHtmlTag(descriptor, context)
  }

  function h(
    tag: string,
    props: HtmlTagProps | null,
    ...children: Children
  ): HtmlTagDescriptor
  function h<PropsT>(
    component: FunctionComponentFunction<PropsT>,
    props: PropsT | null,
    ...children: Children
  ): FunctionComponentDescriptor<PropsT>
  function h<PropsT>(
    component: ClassComponentType<PropsT>,
    props: PropsT | null,
    ...children: Children
  ): ClassComponentDescriptor<PropsT>
  function h(component: any, props: any, ...children: any) {
    assert(typeof component === 'string' || typeof component === 'function')

    switch (typeof component) {
      case 'function': {
        if (component[CLASS_COMPONENT_FLAG] as boolean) {
          return createClassComponentDescriptor(
            component,
            props ?? {},
            children
          )
        }

        return createFunctionComponentDescriptor(
          component,
          props ?? {},
          children
        )
      }

      case 'string': {
        return createHtmlTagDescriptor(
          component as TagName,
          props ?? {},
          children
        )
      }
    }
  }

  const render = <StateT = object>(
    rootDescriptor: FunctionComponentDescriptor,
    rootElement: HTMLElement,
    state: State<StateT> = createState({}) as State<StateT>
  ) => {
    let currentlyExecutingUpdates = false
    const updates = new Set<() => void>()
    const mounts = new Set<() => void>()

    const executeUpdatesAndMounts = () => {
      if (currentlyExecutingUpdates) {
        return
      }
      currentlyExecutingUpdates = true

      for (const fn of updates) {
        fn()
        updates.delete(fn)
      }

      for (const fn of mounts) {
        fn()
        mounts.delete(fn)
      }

      currentlyExecutingUpdates = false
    }

    const context: KaikuContext<StateT> = {
      state_: state,
      queueUpdate(fn) {
        updates.add(fn)
        executeUpdatesAndMounts()
      },
      queueMount(fn) {
        mounts.add(fn)
        executeUpdatesAndMounts()
      },
    }

    createHtmlTag(
      {
        type_: ElementDescriptorType.HtmlTag,
        tag_: rootElement.tagName as TagName,
        existingElement: rootElement,
        props: {},
        children_: [rootDescriptor],
      },
      context
    )
  }

  const kaiku = {
    h,
    render,
    createState,
    useEffect,
    useState,
    useRef,
    immutable,
    Component,
  }

  if (typeof module !== 'undefined') {
    module.exports = kaiku
  } else {
    ;(self as any).kaiku = kaiku
  }
})()
