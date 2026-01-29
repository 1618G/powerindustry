#!/bin/bash
# setup-ssh.sh
# ZZA VPS V6.0 - SSH Environment Setup
#
# This script sets up seamless SSH authentication between:
# 1. Local machine → VPS
# 2. VPS → GitHub (for Git-based deployments)
#
# Run this ONCE before your first deployment.
#
# Usage: ./deploy/setup-ssh.sh [--force]
#   --force: Regenerate keys even if they exist

set -e

# ============================================
# Configuration
# ============================================
VPS_IP="${VPS_IP:-72.62.132.74}"
VPS_USER="${VPS_USER:-deploy}"
VPS_ROOT_USER="${VPS_ROOT_USER:-root}"
LOCAL_KEY_NAME="${LOCAL_KEY_NAME:-zza_vps_key}"
VPS_ALIAS="${VPS_ALIAS:-zza-vps}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# ============================================
# Helper Functions
# ============================================
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

print_header() {
    echo ""
    echo "============================================"
    echo -e "${BLUE}$1${NC}"
    echo "============================================"
}

# ============================================
# Check arguments
# ============================================
FORCE_REGEN=false
if [[ "$1" == "--force" ]]; then
    FORCE_REGEN=true
    log_warning "Force mode: Will regenerate keys if they exist"
fi

# ============================================
# Main Setup
# ============================================
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║    ZZA VPS V6.0 - SSH Environment Setup                       ║"
echo "║                                                               ║"
echo "║    This will configure SSH keys for deployment:               ║"
echo "║    • Local machine → VPS (deploy user)                        ║"
echo "║    • VPS deploy user → GitHub                                 ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# ============================================
# Step 1: Check/Create Local SSH Key for VPS
# ============================================
print_header "Step 1: Local SSH Key for VPS Access"

LOCAL_KEY_PATH="$HOME/.ssh/$LOCAL_KEY_NAME"

if [[ -f "$LOCAL_KEY_PATH" && "$FORCE_REGEN" == "false" ]]; then
    log_success "Local VPS key already exists: $LOCAL_KEY_PATH"
else
    log_info "Generating SSH key for VPS access..."
    ssh-keygen -t ed25519 -C "local-to-vps" -f "$LOCAL_KEY_PATH" -N ""
    log_success "Generated: $LOCAL_KEY_PATH"
fi

# ============================================
# Step 2: Configure SSH Config
# ============================================
print_header "Step 2: Configuring SSH Config"

SSH_CONFIG="$HOME/.ssh/config"
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

# Check if config already has entry
if grep -q "Host $VPS_ALIAS" "$SSH_CONFIG" 2>/dev/null; then
    log_success "SSH config already has $VPS_ALIAS entry"
else
    log_info "Adding VPS entries to SSH config..."
    cat >> "$SSH_CONFIG" << EOF

# ZZA VPS - Deploy User (use for ALL deployments)
Host $VPS_ALIAS
    HostName $VPS_IP
    User $VPS_USER
    IdentityFile ~/.ssh/$LOCAL_KEY_NAME
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new

# ZZA VPS - Root User (emergency only)
Host ${VPS_ALIAS}-root
    HostName $VPS_IP
    User $VPS_ROOT_USER
    IdentityFile ~/.ssh/$LOCAL_KEY_NAME
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new
EOF
    chmod 600 "$SSH_CONFIG"
    log_success "Added VPS entries to SSH config"
fi

# ============================================
# Step 3: Copy Local Key to VPS
# ============================================
print_header "Step 3: Copying SSH Key to VPS"

log_info "Copying public key to VPS (deploy user)..."
log_warning "You may be prompted for the deploy user password."
echo ""

# Copy key to deploy user
if ssh-copy-id -i "$LOCAL_KEY_PATH.pub" "$VPS_USER@$VPS_IP" 2>/dev/null; then
    log_success "Key copied to deploy user"
else
    log_warning "ssh-copy-id failed. Trying manual method..."
    cat "$LOCAL_KEY_PATH.pub" | ssh "$VPS_USER@$VPS_IP" "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
    log_success "Key copied manually to deploy user"
fi

# Test connection
log_info "Testing VPS connection..."
if ssh $VPS_ALIAS "echo 'Connection successful'" 2>/dev/null; then
    log_success "VPS connection working!"
else
    log_error "VPS connection failed. Please check credentials."
    exit 1
fi

# ============================================
# Step 4: Generate VPS Deploy User SSH Key for GitHub
# ============================================
print_header "Step 4: VPS Deploy User → GitHub SSH Key"

log_info "Checking/creating SSH key for VPS deploy user..."

VPS_KEY_EXISTS=$(ssh $VPS_ALIAS "test -f ~/.ssh/id_ed25519 && echo 'yes' || echo 'no'")

if [[ "$VPS_KEY_EXISTS" == "yes" && "$FORCE_REGEN" == "false" ]]; then
    log_success "VPS deploy user already has SSH key"
else
    log_info "Generating SSH key on VPS for GitHub access..."
    ssh $VPS_ALIAS "ssh-keygen -t ed25519 -C 'deploy@vps' -f ~/.ssh/id_ed25519 -N ''"
    log_success "Generated SSH key on VPS"
fi

# Get the public key
echo ""
log_info "VPS Deploy User Public Key (ADD THIS TO GITHUB):"
echo "────────────────────────────────────────────────────────"
echo ""
ssh $VPS_ALIAS "cat ~/.ssh/id_ed25519.pub"
echo ""
echo "────────────────────────────────────────────────────────"
echo ""

# ============================================
# Step 5: Provide GitHub Instructions
# ============================================
print_header "Step 5: Add Deploy Key to GitHub"

echo -e "${YELLOW}IMPORTANT: Add the above key to your GitHub repository:${NC}"
echo ""
echo "1. Go to your repository on GitHub"
echo "2. Click: Settings → Deploy keys → Add deploy key"
echo "3. Title: VPS Deploy Key"
echo "4. Paste the public key shown above"
echo "5. Check 'Allow write access' (if you need to push tags)"
echo "6. Click 'Add key'"
echo ""

read -p "Press ENTER after you've added the key to GitHub..."

# ============================================
# Step 6: Test GitHub Connection from VPS
# ============================================
print_header "Step 6: Testing GitHub Connection from VPS"

log_info "Testing SSH connection to GitHub from VPS..."

# First, ensure GitHub's host key is known
ssh $VPS_ALIAS "ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null" || true

# Test the connection
GITHUB_RESULT=$(ssh $VPS_ALIAS "ssh -T git@github.com 2>&1" || true)
if echo "$GITHUB_RESULT" | grep -q "successfully authenticated"; then
    log_success "GitHub connection from VPS working!"
else
    log_warning "GitHub connection test returned: $GITHUB_RESULT"
    log_warning "If you see 'Permission denied', ensure the deploy key was added to GitHub"
fi

# ============================================
# Step 7: Create Directory Structure on VPS
# ============================================
print_header "Step 7: Creating VPS Directory Structure"

log_info "Ensuring directory structure on VPS..."
ssh $VPS_ALIAS << 'ENDSSH'
mkdir -p ~/apps
mkdir -p ~/backups
echo "Directory structure ready:"
ls -la ~/
ENDSSH
log_success "VPS directory structure ready"

# ============================================
# Summary
# ============================================
print_header "Setup Complete!"

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║    ✅ SSH Environment Setup Complete                          ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "What's been configured:"
echo ""
echo "  📍 Local Machine:"
echo "     • SSH key for VPS: ~/.ssh/$LOCAL_KEY_NAME"
echo "     • SSH config aliases: $VPS_ALIAS, ${VPS_ALIAS}-root"
echo ""
echo "  📍 VPS Deploy User:"
echo "     • SSH key for GitHub: ~/.ssh/id_ed25519"
echo "     • Apps directory: /home/$VPS_USER/apps/"
echo ""
echo "────────────────────────────────────────────────────────────────"
echo ""
echo "Quick Test Commands:"
echo "  ssh $VPS_ALIAS 'echo connected'          # Test VPS"
echo "  ssh $VPS_ALIAS 'ssh -T git@github.com'   # Test VPS→GitHub"
echo ""
echo "────────────────────────────────────────────────────────────────"
echo ""
echo "Next Steps:"
echo "  1. Clone your repository on VPS:"
echo "     ssh $VPS_ALIAS 'cd ~/apps && git clone git@github.com:org/repo.git appname'"
echo ""
echo "  2. Set up .env on VPS:"
echo "     ssh $VPS_ALIAS 'cd ~/apps/appname/deploy && nano .env'"
echo ""
echo "  3. Deploy using V6.0 script:"
echo "     APP_NAME=appname ./deploy/deploy-v6.sh"
echo ""
log_success "You're ready to deploy!"
