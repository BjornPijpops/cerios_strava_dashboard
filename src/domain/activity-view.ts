import { Activity } from './types';
import { round } from './units';

export interface ActivityView {
  name: string;
  member: string;
  sportType: string;
  date: string;
  value: number;
  hours: number;
  km: number;
  /** False for sports where distance is meaningless (badminton, weights...). */
  hasDistance: boolean;
  /** min/km for on-foot sports, km/h for cycling; undefined without distance. */
  pace?: { value: number; unit: 'min/km' | 'km/h' };
  elevationGainM?: number;
  averageHeartrate?: number;
}

/** Sports where distance and pace mean something. */
const DISTANCE_SPORTS = new Set([
  'Run', 'TrailRun', 'VirtualRun', 'Walk', 'Hike',
  'Ride', 'MountainBikeRide', 'GravelRide', 'EBikeRide', 'EMountainBikeRide', 'VirtualRide', 'Velomobile', 'Handcycle',
  'Swim', 'Rowing', 'Canoeing', 'Kayaking', 'NordicSki', 'AlpineSki', 'Snowshoe', 'InlineSkate', 'IceSkate', 'Skateboard', 'StandUpPaddling', 'Surfing', 'Sail', 'Wheelchair',
]);

/** Sports whose pace is shown as minutes per km; the other distance sports show km/h. */
const ON_FOOT = new Set(['Run', 'TrailRun', 'VirtualRun', 'Walk', 'Hike', 'Snowshoe']);

function paceOf(a: Activity): ActivityView['pace'] {
  if (!DISTANCE_SPORTS.has(a.sportType) || a.distanceM <= 0 || a.movingTimeSec <= 0) return undefined;
  const km = a.distanceM / 1000;
  return ON_FOOT.has(a.sportType)
    ? { value: round(a.movingTimeSec / 60 / km), unit: 'min/km' }
    : { value: round(km / (a.movingTimeSec / 3600), 1), unit: 'km/h' };
}

/** What the activity table shows for one activity. `value` is the challenge metric, in its display unit. */
export function toActivityView(a: Activity, memberName: string, value: number): ActivityView {
  return {
    name: a.name,
    member: memberName,
    sportType: a.sportType,
    date: a.startDate,
    value: round(value),
    hours: round(a.movingTimeSec / 3600),
    km: round(a.distanceM / 1000),
    hasDistance: DISTANCE_SPORTS.has(a.sportType) && a.distanceM > 0,
    pace: paceOf(a),
    elevationGainM: a.elevationGainM ? Math.round(a.elevationGainM) : undefined,
    averageHeartrate: a.averageHeartrate ? Math.round(a.averageHeartrate) : undefined,
  };
}
