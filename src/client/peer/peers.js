import CallActions from '../actions/CallActions.js'
import NotifyActions from '../actions/NotifyActions.js'
import Peer from './Peer.js'
import _ from 'underscore'
import _debug from 'debug'
import iceServers from '../iceServers.js'
import { dispatch } from '../store.js'
import { play } from '../window/video.js'

const debug = _debug('peercalls')

let peers = {}

/**
 * @param {Socket} socket
 * @param {User} user
 * @param {String} user.id
 * @param {Boolean} [initiator=false]
 * @param {MediaStream} [stream]
 */
function create ({ socket, user, initiator, stream }) {
  debug('create peer: %s, stream:', user.id, stream)
  dispatch(
    NotifyActions.warn('Connecting to peer...')
  )

  if (peers[user.id]) {
    dispatch(
      NotifyActions.info('Cleaning up old connection...')
    )
    destroy(user.id)
  }

  const peer = peers[user.id] = Peer.init({
    initiator: socket.id === initiator,
    stream,
    config: { iceServers }
  })

  peer.once('error', err => {
    debug('peer: %s, error %s', user.id, err.stack)
    dispatch(
      NotifyActions.error('A peer connection error occurred')
    )
    destroy(user.id)
  })

  peer.on('signal', signal => {
    debug('peer: %s, signal: %o', user.id, signal)

    const payload = { userId: user.id, signal }
    socket.emit('signal', payload)
  })

  peer.once('connect', () => {
    debug('peer: %s, connect', user.id)
    dispatch(
      NotifyActions.warn('Peer connection established')
    )
    play()
  })

  peer.on('stream', stream => {
    debug('peer: %s, stream', user.id)
    dispatch(CallActions.addStream({
      userId: user.id,
      stream
    }))
  })

  peer.on('data', object => {
    object = JSON.parse(new window.TextDecoder('utf-8').decode(object))
    debug('peer: %s, message: %o', user.id, object)
    dispatch(
      NotifyActions.info('' + user.id + ': ' + object.message)
    )
  })

  peer.once('close', () => {
    debug('peer: %s, close', user.id)
    dispatch(
      NotifyActions.error('Peer connection closed')
    )
    dispatch(
      CallActions.removeStream(user.id)
    )

    // make sure some other peer with same id didn't take place between calling
    // `destroy()` and `close` event
    if (peers[user.id] === peer) delete peers[user.id]
  })
}

function get (userId) {
  return peers[userId]
}

function getIds () {
  return _.map(peers, (peer, id) => id)
}

function clear () {
  debug('clear')
  _.each(peers, (_, userId) => destroy(userId))
  peers = {}
}

function destroy (userId) {
  debug('destroy peer: %s', userId)
  let peer = peers[userId]
  if (!peer) return debug('peer: %s peer not found', userId)
  peer.destroy()
  delete peers[userId]
}

function message (message) {
  message = JSON.stringify({ message })
  _.each(peers, peer => peer.send(message))
}

module.exports = { create, get, getIds, destroy, clear, message }
