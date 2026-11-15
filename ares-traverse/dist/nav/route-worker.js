import {planMission} from './routing.js';

let grid;
self.onmessage = ({data}) => {
  try {
    if (data.grid) grid = data.grid;
    self.postMessage({id: data.id, routes: planMission(grid, data.mission)});
  } catch (error) {
    self.postMessage({id: data.id, error: error.message});
  }
};
