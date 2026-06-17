import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("kanalensDesktop", {
  isDesktop: true,
});
