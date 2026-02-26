/**
 * Barrel que reexporta los handlers IPC desde electron/ipc.
 * Los handlers están divididos por dominio en ipc/catalogHandlers, configHandlers, windowHandlers, loggingHandlers.
 *
 * @module ipcHandlers
 * @deprecated Preferir importar desde './ipc' en nuevo código.
 */
export { registerHandlers, removeHandlers } from './ipc';
