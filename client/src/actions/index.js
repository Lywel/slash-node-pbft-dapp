export const simpleAction = () => dispatch => {
  // let res = await longWork()
  dispatch({
    type: 'SIMPLE_ACTION',
    payload: 'res'
  })
}

export const FETCH_BLOCKS_BEGIN   = 'FETCH_BLOCKS_BEGIN'
export const FETCH_BLOCKS_SUCCESS = 'FETCH_BLOCKS_SUCCESS'
export const FETCH_BLOCKS_ERROR = 'FETCH_BLOCKS_FAILURE'

export const fetchBlocksBegin = () => ({
  type: FETCH_BLOCKS_BEGIN
})

export const fetchBlocksSuccess = blocks => ({
  type: FETCH_BLOCKS_SUCCESS,
  payload: { blocks }
})

export const fetchBlocksError = error => ({
  type: FETCH_BLOCKS_ERROR,
  payload: { error }
})

function handleErrors(response) {
  if (!response.ok) {
    throw Error(response.statusText)
  }
  return response
}

export function fetchBlocks() {
  return dispatch => {
    dispatch(fetchBlocksBegin())
    return fetch('http://localhost:3001/blocks')
      .then(handleErrors)
      .then(res => res.json())
      .then(json => {
        console.log(json)
        dispatch(fetchBlocksSuccess(json))
        return json
      })
      .catch(err => dispatch(fetchBlocksError(err)))
  }
}
