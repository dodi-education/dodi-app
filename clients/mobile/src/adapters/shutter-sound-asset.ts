/**
 * The bundled shutter sound: the same file the web serves from
 * clients/web/public/sounds/snapshot.mp3. Its own module so tests of
 * shutter-sound can stand in for Metro's asset require.
 */
export const SHUTTER_SOUND_MODULE: number = require("../../assets/sounds/snapshot.mp3");
