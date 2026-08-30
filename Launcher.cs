using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace TwitchCasinoLauncher
{
    class Program
    {
        private static Process backendProcess = null;

        static void Main(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;
            Console.Title = "🎰 Casino & Ruleta de Twitch - Streamer App";

            string rootDir = AppDomain.CurrentDomain.BaseDirectory;
            Directory.SetCurrentDirectory(rootDir);

            PrintHeader();

            // 1. Verificar si Node.js está instalado
            if (!IsNodeInstalled())
            {
                DialogResult res = MessageBox.Show(
                    "Node.js no está instalado en esta computadora.\n\n" +
                    "Para que el Casino de Twitch funcione necesitas tener instalado Node.js (versión LTS).\n\n" +
                    "¿Deseas abrir la página oficial de Node.js para descargarlo ahora?",
                    "Node.js Requerido - Casino Twitch",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Warning
                );

                if (res == DialogResult.Yes)
                {
                    Process.Start(new ProcessStartInfo("https://nodejs.org/") { UseShellExecute = true });
                }
                return;
            }

            // 2. Manejador para cerrar el proceso hijo al cerrar la ventana
            AppDomain.CurrentDomain.ProcessExit += (s, e) => KillBackend();
            Console.CancelKeyPress += (s, e) => KillBackend();

            // 3. Verificar dependencias y compilación
            EnsureDependenciesAndBuild(rootDir);

            // 4. Iniciar servidor backend
            StartBackend(rootDir);

            // 5. Abrir navegador en http://localhost:3000
            Thread.Sleep(1500);
            try
            {
                Process.Start(new ProcessStartInfo("http://localhost:3000") { UseShellExecute = true });
            }
            catch { }

            Console.WriteLine();
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("=========================================================================");
            Console.WriteLine("  ✅ SISTEMA INICIADO CORRECTAMENTE");
            Console.WriteLine("  🌐 Panel de Control del Streamer:  http://localhost:3000");
            Console.WriteLine("  🎬 Enlace para OBS Browser Source: http://localhost:3000/?overlay=true");
            Console.WriteLine();
            Console.WriteLine("  * Mantén esta ventana abierta mientras estés en stream.");
            Console.WriteLine("  * Para cerrar el programa, simplemente cierra esta ventana.");
            Console.WriteLine("=========================================================================");
            Console.ResetColor();
            Console.WriteLine();

            // Esperar que el proceso termine
            if (backendProcess != null)
            {
                backendProcess.WaitForExit();
            }
        }

        private static void PrintHeader()
        {
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("=========================================================================");
            Console.WriteLine("       🎰 CASINO & RULETA DE TWITCH - LAUNCHER AUTOEJECUTABLE 🎰");
            Console.WriteLine("=========================================================================");
            Console.ResetColor();
            Console.WriteLine();
        }

        private static bool IsNodeInstalled()
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("node", "-v")
                {
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using (Process p = Process.Start(psi))
                {
                    p.WaitForExit();
                    return p.ExitCode == 0;
                }
            }
            catch
            {
                return false;
            }
        }

        private static void EnsureDependenciesAndBuild(string rootDir)
        {
            string backendDir = Path.Combine(rootDir, "backend");
            string frontendDir = Path.Combine(rootDir, "frontend");

            if (!Directory.Exists(Path.Combine(backendDir, "node_modules")))
            {
                Console.WriteLine("📦 Instalando dependencias del servidor (backend)...");
                RunCommand("npm", "install", backendDir);
            }

            if (!Directory.Exists(Path.Combine(frontendDir, "node_modules")))
            {
                Console.WriteLine("📦 Instalando dependencias visuales (frontend)...");
                RunCommand("npm", "install", frontendDir);
            }

            if (!Directory.Exists(Path.Combine(frontendDir, "dist")))
            {
                Console.WriteLine("🔨 Compilando interfaz web...");
                RunCommand("npm", "run build", frontendDir);
            }

            if (!Directory.Exists(Path.Combine(backendDir, "dist")))
            {
                Console.WriteLine("🔨 Compilando servidor...");
                RunCommand("npm", "run build", backendDir);
            }
        }

        private static void StartBackend(string rootDir)
        {
            string backendDir = Path.Combine(rootDir, "backend");
            string mainJs = Path.Combine(backendDir, "dist", "main.js");

            ProcessStartInfo psi = new ProcessStartInfo("node", "\"" + mainJs + "\"")
            {
                WorkingDirectory = backendDir,
                UseShellExecute = false,
                RedirectStandardOutput = false,
                RedirectStandardError = false
            };

            try
            {
                backendProcess = Process.Start(psi);
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("❌ Error al iniciar el servidor: " + ex.Message);
                Console.ResetColor();
            }
        }

        private static void RunCommand(string command, string args, string workingDir)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c " + command + " " + args)
                {
                    WorkingDirectory = workingDir,
                    UseShellExecute = false
                };
                using (Process p = Process.Start(psi))
                {
                    p.WaitForExit();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Aviso: " + ex.Message);
            }
        }

        private static void KillBackend()
        {
            try
            {
                if (backendProcess != null && !backendProcess.HasExited)
                {
                    backendProcess.Kill();
                    backendProcess.Dispose();
                    backendProcess = null;
                }
            }
            catch { }
        }
    }
}
