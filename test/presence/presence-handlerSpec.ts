import { Promise as BBPromise } from 'bluebird'
import { EventEmitter } from 'events'
import { expect } from 'chai'
import { assert, spy } from 'sinon'
import { getServicesMock, getLastMessageSent } from '../mocks'
import { EVENT } from '../../src/constants'
import { TOPIC, PRESENCE_ACTIONS, PresenceMessage } from '../../binary-protocol/src/message-constants'
import * as Emitter from 'component-emitter2'

import { DefaultOptions, Options } from '../../src/client-options'
import { PresenceHandler, QueryResult, IndividualQueryResult } from '../../src/presence/presence-handler'

describe.only('Presence handler', () => {
  let services: any
  let presenceHandler: PresenceHandler
  let handle: Function
  let callbackSpy: sinon.SinonSpy
  const options = Object.assign({}, DefaultOptions)
  let counter: number

  beforeEach(() => {
    services = getServicesMock()
    presenceHandler = new PresenceHandler(new Emitter(), services, options)
    handle = services.getHandle()
    callbackSpy = spy()
    counter = 0
  })

  afterEach(() => {
    services.verify()
  })

  it('validates parameters on subscribe, unsubscribe and getAll', () => {
    expect(presenceHandler.subscribe.bind(presenceHandler)).to.throw()
    expect(presenceHandler.subscribe.bind(presenceHandler, 'name')).to.throw()
    expect(presenceHandler.subscribe.bind(presenceHandler, 'name', 123)).to.throw()
    expect(presenceHandler.subscribe.bind(presenceHandler, 'name', {})).to.throw()
    expect(presenceHandler.subscribe.bind(presenceHandler, '', () => {})).to.throw()
    expect(presenceHandler.subscribe.bind(presenceHandler, 123, () => {})).to.throw()
    expect(presenceHandler.subscribe.bind(presenceHandler, null, () => {})).to.throw()
    expect(presenceHandler.subscribe.bind(presenceHandler, undefined, () => {})).to.throw()

    expect(presenceHandler.unsubscribe.bind(presenceHandler)).to.throw()
    expect(presenceHandler.unsubscribe.bind(presenceHandler, '')).to.throw()
    expect(presenceHandler.unsubscribe.bind(presenceHandler, 123)).to.throw()
    expect(presenceHandler.unsubscribe.bind(presenceHandler, null)).to.throw()
    expect(presenceHandler.unsubscribe.bind(presenceHandler, 'name', 1)).to.throw()
    expect(presenceHandler.unsubscribe.bind(presenceHandler, 'name', {})).to.throw()
    expect(presenceHandler.unsubscribe.bind(presenceHandler, 'name', 'name')).to.throw()

    expect(presenceHandler.getAll.bind(presenceHandler, '')).to.throw()
    expect(presenceHandler.getAll.bind(presenceHandler, 123)).to.throw()
    expect(presenceHandler.getAll.bind(presenceHandler, null)).to.throw()
    expect(presenceHandler.getAll.bind(presenceHandler, 'name', {})).to.throw()
    expect(presenceHandler.getAll.bind(presenceHandler, 'name', 1)).to.throw()
  })

  it('cant\'t query getAll when client is offline', async () => {
    const promisseError = spy()
    const promisseSuccess = spy()

    services.connection.isConnected = false
    services.connectionMock
      .expects('sendMessage')
      .never()

    presenceHandler.getAll(callbackSpy)
    const promise = presenceHandler.getAll()
    promise.then(promisseSuccess).catch(promisseError)

    await BBPromise.delay(0)
    assert.calledOnce(callbackSpy)
    assert.calledWithExactly(callbackSpy, { reason: EVENT.CLIENT_OFFLINE })

    assert.notCalled(promisseSuccess)
    assert.calledOnce(promisseError)
    assert.calledWithExactly(promisseError, { reason: EVENT.CLIENT_OFFLINE })
  })

  it('subscribes to presence with user a', (done) => {
    const userA = 'userA'
    const messageA = {
      topic: TOPIC.PRESENCE,
      action: PRESENCE_ACTIONS.SUBSCRIBE,
      correlationId: counter.toString(),
      parsedData: [userA]
    }
    services.connectionMock
      .expects('sendMessage')
      .once()
     .withExactArgs(messageA)
    services.timeoutRegistryMock
      .expects('add')
      .once()
      .withExactArgs({ message: messageA})

    presenceHandler.subscribe(userA, callbackSpy)
    process.nextTick(done)
  })

  it('queries for specific users presence', () => {
    const users = ['userA','userB']
    const message = {
      topic: TOPIC.PRESENCE,
      action: PRESENCE_ACTIONS.QUERY,
      correlationId: counter.toString(),
      parsedData: users
    }
    services.connectionMock
      .expects('sendMessage')
      .once()
      .withExactArgs(message)
    services.timeoutRegistryMock
      .expects('add')
      .once()
      .withExactArgs({ message })

    presenceHandler.getAll(users, callbackSpy)
  })

  // it('sends unsubscribe for specific user presence', (done) => {
  //   const user = 'user'
  //   presenceHandler.subscribe(user, callbackSpy)
  //   const message = {
  //     topic: TOPIC.PRESENCE,
  //     action: PRESENCE_ACTIONS.UNSUBSCRIBE,
  //     correlationId: counter.toString(),
  //     parsedData: user
  //   }
  //   services.connectionMock
  //     .expects('sendMessage')
  //     .once()
  //     .withExactArgs(message)
  //   services.timeoutRegistryMock
  //     .expects('add')
  //     .once()
  //     .withExactArgs({ message })

  //   presenceHandler.unsubscribe(user)
  //   process.nextTick(done)
  // })

  // it('sends unsubscribe for all users presence', () => {
  //   presenceHandler.subscribe(callbackSpy)
  //   const message = {
  //     topic: TOPIC.PRESENCE,
  //     action: PRESENCE_ACTIONS.UNSUBSCRIBE_ALL
  //   }
  //   services.connectionMock
  //     .expects('sendMessage')
  //     .once()
  //     .withExactArgs(message)
  //   services.timeoutRegistryMock
  //     .expects('add')
  //     .once()
  //     .withExactArgs({ message })

  //   presenceHandler.unsubscribe()
  // })

  it('queries for all users presence', () => {
    const message = {
      topic: TOPIC.PRESENCE,
      action: PRESENCE_ACTIONS.QUERY_ALL,
      correlationId: counter.toString()
    }
    services.connectionMock
      .expects('sendMessage')
      .once()
      .withExactArgs(message)
    services.timeoutRegistryMock
      .expects('add')
      .once()
      .withExactArgs({ message })

    presenceHandler.getAll(callbackSpy)
  })

  describe('when server responds for getAll for all users ', () => {
    let callback: sinon.SinonSpy
    let promisseSuccess: sinon.SinonSpy
    let promisseError: sinon.SinonSpy
    let promise: Promise<QueryResult>
    let users: Array<string>

    beforeEach(() => {
      callback = spy()
      promisseError = spy()
      promisseSuccess = spy()
      users = ['userA', 'userB']

      presenceHandler.getAll(callback)
      const promise = presenceHandler.getAll()
      promise.then(promisseSuccess).catch(promisseError)
    })

    it('receives data for query all users', async () => {
      const message: Function = (id: number) => { return {
        topic: TOPIC.PRESENCE,
        action: PRESENCE_ACTIONS.QUERY_ALL_RESPONSE,
        parsedData: users,
        correlationId: id.toString()
      }}
      const messageFromCallback = message(counter)
      const messageFromPromise = message(counter + 1)
      services.timeoutRegistryMock
        .expects('remove')
        .once()
        .withExactArgs(messageFromCallback)
      services.timeoutRegistryMock
        .expects('remove')
        .once()
        .withExactArgs(messageFromPromise)

      presenceHandler.handle(messageFromCallback)
      presenceHandler.handle(messageFromPromise)

      await BBPromise.delay(1)
      assert.calledOnce(callback)
      assert.calledWithExactly(callback, null, users)

      assert.notCalled(promisseError)
      assert.calledOnce(promisseSuccess)
      assert.calledWithExactly(promisseSuccess, users)
    })

    it('recieves message denied for query all users', async () => {

    })
    it('recieves permission error for query all users', async () => {

    })
  })

  describe('when server responds for getAll for specific users ', () => {
    let callback: sinon.SinonSpy
    let promisseSuccess: sinon.SinonSpy
    let promisseError: sinon.SinonSpy
    let promise: Promise<QueryResult>
    let users: Array<string>
    let usersPresence: IndividualQueryResult

    beforeEach(() => {
      callback = spy()
      promisseError = spy()
      promisseSuccess = spy()
      users = ['userA', 'userB']
      usersPresence = { 'userA': true, 'userB': false }
      presenceHandler.getAll(users, callback)
      const promise = presenceHandler.getAll(users)
      promise.then(promisseSuccess).catch(promisseError)
    })

    it('receives data for query specific users', async () => {
      const message: Function = (id: number) => { return {
        topic: TOPIC.PRESENCE,
        action: PRESENCE_ACTIONS.QUERY_RESPONSE,
        parsedData: usersPresence,
        correlationId: id.toString()
      }}
      const messageFromCallback = message(counter)
      const messageFromPromise = message(counter + 1)
      services.timeoutRegistryMock
        .expects('remove')
        .once()
        .withExactArgs(messageFromCallback)
      services.timeoutRegistryMock
        .expects('remove')
        .once()
        .withExactArgs(messageFromPromise)

      presenceHandler.handle(messageFromCallback)
      presenceHandler.handle(messageFromPromise)

      await BBPromise.delay(1)
      assert.calledOnce(callback)
      assert.calledWithExactly(callback, null, usersPresence)

      assert.notCalled(promisseError)
      assert.calledOnce(promisseSuccess)
      assert.calledWithExactly(promisseSuccess, usersPresence)
    })


    it('recieves message denied for query users', async () => {

    })
    it('recieves permission error for query users', async () => {

    })
  })

  describe('when subscribing to userA, userB and all', () => {
    const userA = 'userA'
    const userB = 'userB'
    const userACallback = spy()
    const userBCallback = spy()
    const allUsersCallback = spy()
    beforeEach(() => {
      presenceHandler.subscribe(userA, userACallback)
      presenceHandler.subscribe(userB, userBCallback)
      presenceHandler.subscribe(allUsersCallback)
    })

    it('notifies when userA logs in', () => {
      presenceHandler.handle({
        name: userA,
        topic: TOPIC.PRESENCE,
        action: PRESENCE_ACTIONS.PRESENCE_JOIN
      })

      assert.calledOnce(userACallback)
      assert.calledWithExactly(userACallback, true, userA)

      assert.notCalled(userBCallback)

      assert.calledOnce(allUsersCallback)
      assert.calledWithExactly(allUsersCallback, true, userA)
    })

    it('notifies when userB logs out', () => {
      presenceHandler.handle({
        name: userB,
        topic: TOPIC.PRESENCE,
        action: PRESENCE_ACTIONS.PRESENCE_LEAVE
      })

      assert.notCalled(userACallback)

      assert.calledOnce(userBCallback)
      assert.calledWithExactly(userBCallback, false, userB)

      assert.calledOnce(allUsersCallback)
      assert.calledWithExactly(allUsersCallback, false, userB)
    })

    it('notifies only the all users callback when userC logs in', () => {
      const userC = 'userC'
      presenceHandler.handle({
        name: userC,
        topic: TOPIC.PRESENCE,
        action: PRESENCE_ACTIONS.PRESENCE_JOIN
      })

      assert.notCalled(userACallback)

      assert.notCalled(userBCallback)

      assert.calledOnce(allUsersCallback)
      assert.calledWithExactly(allUsersCallback, true, userB)
    })

    it('notifies only the all users callback when userC logs out', () => {
      const userC = 'userC'
      presenceHandler.handle({
        name: userC,
        topic: TOPIC.PRESENCE,
        action: PRESENCE_ACTIONS.PRESENCE_LEAVE
      })

      assert.notCalled(userACallback)

      assert.notCalled(userBCallback)

      assert.calledOnce(allUsersCallback)
      assert.calledWithExactly(allUsersCallback, false, userB)
    })

    // it('doesn\'t notify callbacks when userA logs in after unsubscribing', () => {
    //   presenceHandler.unsubscribe(userA)

    //   presenceHandler.handle({
    //     name: userA,
    //     topic: TOPIC.PRESENCE,
    //     action: PRESENCE_ACTIONS.PRESENCE_JOIN
    //   })

    //   assert.notCalled(userACallback)

    //   assert.notCalled(userBCallback)

    //   assert.notCalled(allUsersCallback)
    // })

    it('doesn\'t notify userA callback when userA logs in after unsubscribing', () => {
      presenceHandler.unsubscribe(userA, userACallback)

      presenceHandler.handle({
        name: userA,
        topic: TOPIC.PRESENCE,
        action: PRESENCE_ACTIONS.PRESENCE_JOIN
      })

      assert.notCalled(userACallback)

      assert.notCalled(userBCallback)

      assert.calledOnce(allUsersCallback)
      assert.calledWithExactly(allUsersCallback, true, userA)
    })

  })

})
