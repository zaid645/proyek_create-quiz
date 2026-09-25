#!/bin/bash

# Jalur absolut ke direktori proyek saat ini
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Fungsi utama yang memproses Git
run_git_process() {
    cd "$REPO_DIR" || { echo "❌ Gagal masuk ke direktori proyek."; read -p "Tekan Enter untuk keluar..."; exit 1; }
    
    echo "🚀 Memulai proses Auto Push..."
    echo "------------------------------------------------"

    if [ ! -d ".git" ]; then
        echo "❌ Error: Ini bukan direktori Git."
        echo ""
        read -p "Tekan Enter untuk menutup jendela ini..."
        exit 1
    fi

    echo "📦 Menambahkan perubahan ke staging area..."
    git add .

    echo -n "💬 Masukkan pesan commit (atau Enter untuk default): "
    read commit_msg

    if [ -z "$commit_msg" ]; then
        commit_msg="Update pada $(date '+%Y-%m-%d %H:%M:%S')"
    fi

    git commit -m "$commit_msg"
    
    current_branch=$(git branch --show-current)
    
    if [ -z "$current_branch" ]; then
        echo "❌ Error: Tidak dapat menentukan branch. Apakah sudah ada commit pertama?"
        echo ""
        read -p "Tekan Enter untuk menutup jendela ini..."
        exit 1
    fi

    echo "🚀 Melakukan push ke origin/$current_branch..."
    
    # Mengecek apakah perintah push berhasil atau gagal
    if git push origin "$current_branch"; then
        echo "------------------------------------------------"
        echo "✅ Selesai! Proses push berhasil."
    else
        echo "------------------------------------------------"
        echo "❌ Gagal! Terjadi kesalahan saat melakukan push (cek log di atas)."
    fi

    echo ""
    # Skrip akan tertahan di sini sampai kamu menekan Enter
    read -p "Tekan Enter untuk menutup jendela ini..."
}

# Cek apakah skrip ini dipanggil oleh terminal emulator dengan argumen khusus
if [ "$1" == "--run-process" ]; then
    run_git_process
    exit 0
fi

# --- BAGIAN MEMBUKA TERMINAL BARU ---
# Mengecek apakah skrip sudah berjalan di dalam terminal interaktif
if [ -t 1 ]; then
    # Jika sudah ada terminal (misal: kamu jalankan via ./auto_push.sh di terminal), langsung eksekusi
    run_git_process
else
    # Jika tidak ada terminal (misal: double-click dari File Manager GUI)
    # Mengutamakan xfce4-terminal khusus untuk pengguna Linux Lite
    if command -v xfce4-terminal &> /dev/null; then
        xfce4-terminal -x bash "$0" --run-process
    elif command -v gnome-terminal &> /dev/null; then
        gnome-terminal -- bash "$0" --run-process
    elif command -v konsole &> /dev/null; then
        konsole -e "bash \"$0\" --run-process"
    elif command -v alacritty &> /dev/null; then
        alacritty -e bash "$0" --run-process
    elif command -v kitty &> /dev/null; then
        kitty bash "$0" --run-process
    else
        # Fallback jika tidak ada terminal modern yang cocok
        xterm -e bash "$0" --run-process
    fi
fi