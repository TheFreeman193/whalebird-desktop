import generator, { Entity } from 'megalodon'
import parse from 'parse-link-header'
import { Module, MutationTree, ActionTree } from 'vuex'
import { RootState } from '@/store'
import { LocalAccount } from '~/src/types/localAccount'
import { LocalServer } from '~/src/types/localServer'

export type FavouritesState = {
  favourites: Array<Entity.Status>
  maxId: string | null
}

const state = (): FavouritesState => ({
  favourites: [],
  maxId: null
})

export const MUTATION_TYPES = {
  UPDATE_FAVOURITES: 'updateFavourites',
  INSERT_FAVOURITES: 'insertFavourites',
  UPDATE_TOOT: 'updateToot',
  DELETE_TOOT: 'deleteToot',
  CHANGE_MAX_ID: 'changeMaxId'
}

const mutations: MutationTree<FavouritesState> = {
  [MUTATION_TYPES.UPDATE_FAVOURITES]: (state, favourites: Array<Entity.Status>) => {
    state.favourites = favourites
  },
  [MUTATION_TYPES.INSERT_FAVOURITES]: (state, favourites: Array<Entity.Status>) => {
    state.favourites = state.favourites.concat(favourites)
  },
  [MUTATION_TYPES.UPDATE_TOOT]: (state, message: Entity.Status) => {
    state.favourites = state.favourites.map(toot => {
      if (toot.id === message.id) {
        return message
      } else if (toot.reblog !== null && toot.reblog.id === message.id) {
        // When user reblog/favourite a reblogged toot, target message is a original toot.
        // So, a message which is received now is original toot.
        const reblog = {
          reblog: message
        }
        return Object.assign(toot, reblog)
      } else {
        return toot
      }
    })
  },
  [MUTATION_TYPES.DELETE_TOOT]: (state, message: Entity.Status) => {
    state.favourites = state.favourites.filter(toot => {
      if (toot.reblog !== null && toot.reblog.id === message.id) {
        return false
      } else {
        return toot.id !== message.id
      }
    })
  },
  [MUTATION_TYPES.CHANGE_MAX_ID]: (state, id: string | null) => {
    state.maxId = id
  }
}

export const ACTION_TYPES = {
  FETCH_FAVOURITES: 'fetchFavourites',
  LAZY_FETCH_FAVOURITES: 'lazyFetchFavourites'
}

const actions: ActionTree<FavouritesState, RootState> = {
  [ACTION_TYPES.FETCH_FAVOURITES]: async (
    { commit, rootState },
    req: { account: LocalAccount; server: LocalServer }
  ): Promise<Array<Entity.Status>> => {
    const client = generator(req.server.sns, req.server.baseURL, req.account.accessToken, rootState.App.userAgent)
    const res = await client.getFavourites({ limit: 20 })
    commit(MUTATION_TYPES.UPDATE_FAVOURITES, res.data)
    // Parse link header
    try {
      const link = parse(res.headers.link)
      if (link !== null && link.next) {
        commit(MUTATION_TYPES.CHANGE_MAX_ID, link.next.max_id)
      } else {
        commit(MUTATION_TYPES.CHANGE_MAX_ID, null)
      }
    } catch (err) {
      commit(MUTATION_TYPES.CHANGE_MAX_ID, null)
      console.error(err)
    }
    return res.data
  },
  lazyFetchFavourites: async (
    { state, commit, rootState },
    req: { account: LocalAccount; server: LocalServer }
  ): Promise<Array<Entity.Status> | null> => {
    if (!state.maxId) {
      return Promise.resolve(null)
    }
    const client = generator(req.server.sns, req.server.baseURL, req.account.accessToken, rootState.App.userAgent)
    const res = await client.getFavourites({ max_id: state.maxId, limit: 20 })
    commit(MUTATION_TYPES.INSERT_FAVOURITES, res.data)
    // Parse link header
    try {
      const link = parse(res.headers.link)
      if (link !== null && link.next) {
        commit(MUTATION_TYPES.CHANGE_MAX_ID, link.next.max_id)
      } else {
        commit(MUTATION_TYPES.CHANGE_MAX_ID, null)
      }
    } catch (err) {
      commit(MUTATION_TYPES.CHANGE_MAX_ID, null)
      console.error(err)
    }
    return res.data
  }
}

const Favourites: Module<FavouritesState, RootState> = {
  namespaced: true,
  state: state,
  mutations: mutations,
  actions: actions
}

export default Favourites
