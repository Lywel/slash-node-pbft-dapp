import {
  FETCH_BLOCKS_BEGIN,
  FETCH_BLOCKS_SUCCESS,
  FETCH_BLOCKS_ERROR
} from '../actions/index';

const initialState = {
  blocks: [],
  loading: false,
  error: null
}

export const rootReducer = (state = initialState, action) => {
  switch (action.type) {
  case FETCH_BLOCKS_BEGIN:
    return {
      ...state,
      loading: true,
      error: null
    }
  case FETCH_BLOCKS_SUCCESS:
    return {
      ...state,
      blocks: action.payload.blocks,
      loading: false
    }
  case FETCH_BLOCKS_ERROR:
    return {
      ...state,
      blocks: [],
      loading: false,
      error: action.payload.error
    }
  default:
    return state
  }
}
