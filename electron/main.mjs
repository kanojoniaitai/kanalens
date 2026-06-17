import { app, BrowserWindow, dialog, shell } from "electron";
import path from "node:path";
import { spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;
let mainWindow = null;
let serverProcess = null;

function getAppRoot() {
  return app.getAppPath();
}

function getStandaloneRoot() {
  return isDev
    ? path.join(getAppRoot(), ".next", "standalone")
    : path.join(process.resourcesPath, "standalone");
}

function getNextEntry() {
  return path.join(getStandaloneRoot(), "server.js");
}

function getStaticRoot() {
  return isDev
    ? path.join(getAppRoot(), ".next", "static")
    : path.join(process.resourcesPath, "standalone", ".next", "static");
}

function waitForPort(port, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const tryConnect = () => {
      const socket = net.createConnection({ port, host: "localhost" });

      socket.once("connect", () => {
        socket.end();
        resolve();
      });

      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - start >= timeoutMs) {
          reject(new Error(`Timed out waiting for localhost:${port}`));
          return;
        }
        setTimeout(tryConnect, 250);
      });
    };

    tryConnect();
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "localhost", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to allocate port")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.once("error", reject);
  });
}

async function startNextServer() {
  const port = await getFreePort();
  const standaloneRoot = getStandaloneRoot();
  const nextEntry = getNextEntry();

  serverProcess = spawn(process.execPath, [nextEntry], {
    cwd: standaloneRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "localhost",
      KANALENS_DATA_DIR: path.join(app.getPath("userData"), "data"),
      NEXT_STATIC_DIR: getStaticRoot(),
      ELECTRON_RUN_AS_NODE: "1",
    },
    stdio: "inherit",
    windowsHide: true,
  });

  serverProcess.once("exit", (code) => {
    serverProcess = null;
    if (code !== 0) {
      dialog.showErrorBox("KanaLens server stopped", `The bundled server exited with code ${code ?? "unknown"}.`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close();
      }
    }
  });

  await waitForPort(port);
  return port;
}

async function createMainWindow() {
  const port = isDev ? 3000 : await startNextServer();
  const url = `http://localhost:${port}`;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: "#f5f0df",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.mjs"),
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    shell.openExternal(targetUrl);
    return { action: "deny" };
  });

  await mainWindow.loadURL(url);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

function stopNextServer() {
  if (!serverProcess) return;
  serverProcess.kill();
  serverProcess = null;
}

app.whenReady().then(async () => {
  try {
    await createMainWindow();
  } catch (error) {
    dialog.showErrorBox("Unable to launch KanaLens", error instanceof Error ? error.message : String(error));
    app.quit();
  }

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopNextServer();
});
