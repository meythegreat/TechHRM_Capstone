/** Filamer Christian University, Roxas City. */
export const CAMPUS_LATITUDE = 11.5854;
export const CAMPUS_LONGITUDE = 122.7511;

export interface SunTimes {
  sunrise: Date;
  sunset: Date;
}

function dayOfYear(date: Date) {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((today - start) / 86400000);
}

function solarEvent(date: Date, latitude: number, longitude: number, rising: boolean) {
  const zenith = 90.833;
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const n = dayOfYear(date);
  const lngHour = longitude / 15;
  const t = n + ((rising ? 6 : 18) - lngHour) / 24;
  const meanAnomaly = 0.9856 * t - 3.289;
  let sunLongitude = meanAnomaly + 1.916 * Math.sin(meanAnomaly * toRad) + 0.02 * Math.sin(2 * meanAnomaly * toRad) + 282.634;
  sunLongitude = (sunLongitude + 360) % 360;
  let rightAscension = toDeg * Math.atan(0.91764 * Math.tan(sunLongitude * toRad));
  rightAscension = (rightAscension + 360) % 360;
  const longitudeQuadrant = Math.floor(sunLongitude / 90) * 90;
  const ascensionQuadrant = Math.floor(rightAscension / 90) * 90;
  rightAscension = (rightAscension + (longitudeQuadrant - ascensionQuadrant)) / 15;
  const sinDeclination = 0.39782 * Math.sin(sunLongitude * toRad);
  const cosDeclination = Math.cos(Math.asin(sinDeclination));
  const cosHour = (Math.cos(zenith * toRad) - sinDeclination * Math.sin(latitude * toRad)) / (cosDeclination * Math.cos(latitude * toRad));
  const clamped = Math.min(1, Math.max(-1, cosHour));
  const hourAngle = (rising ? 360 - toDeg * Math.acos(clamped) : toDeg * Math.acos(clamped)) / 15;
  let localMean = hourAngle + rightAscension - 0.06571 * t - 6.622;
  localMean = ((localMean % 24) + 24) % 24;
  const universalTime = localMean - lngHour;
  const utcMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return new Date(utcMidnight + universalTime * 3600000);
}

export function campusSunTimes(date = new Date(), latitude = CAMPUS_LATITUDE, longitude = CAMPUS_LONGITUDE): SunTimes {
  return {
    sunrise: solarEvent(date, latitude, longitude, true),
    sunset: solarEvent(date, latitude, longitude, false),
  };
}

export function themeForSun(date = new Date(), times = campusSunTimes(date)): 'light' | 'dark' {
  return date >= times.sunrise && date < times.sunset ? 'light' : 'dark';
}

export function nextSunChange(date = new Date(), times = campusSunTimes(date)): Date {
  if (date < times.sunrise) return times.sunrise;
  if (date < times.sunset) return times.sunset;
  const tomorrow = new Date(date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return campusSunTimes(tomorrow).sunrise;
}
