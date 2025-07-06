# Vana SDK Development Container

This development container provides a secure, isolated environment for working with the Vana SDK using Claude Code or other AI assistants.

## Features

- **Node.js 20 LTS** with TypeScript support
- **Security-first**: Default-deny firewall with only necessary connections allowed
- **VS Code optimized**: Pre-configured extensions for TypeScript, ESLint, and testing
- **Development tools**: Git, Zsh with Oh My Zsh, and common utilities
- **Network isolation**: Controlled access to prevent unwanted external connections

## Getting Started

### Prerequisites

- [VS Code](https://code.visualstudio.com/)
- [Remote - Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### Setup

1. **Open in VS Code**:

   ```bash
   code .
   ```

2. **Reopen in Container**:
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   - Type "Remote-Containers: Reopen in Container"
   - Select the command and wait for the container to build

3. **Verify Setup**:
   - Terminal should show zsh prompt
   - Extensions should be automatically installed
   - Run `npm install` if not already completed

## Security Features

The container includes a custom firewall configuration (`init-firewall.sh`) that:

- **Default deny**: Blocks all network traffic by default
- **Selective allow**: Only permits necessary connections:
  - DNS queries (port 53)
  - HTTP/HTTPS for package management (ports 80, 443)
  - Git SSH to known hosts (port 22)
  - Local development ports (3000, 5173, 4173, 8080)
- **Logging**: Tracks dropped packets for debugging

## Development Workflow

1. **Code editing**: VS Code with full IntelliSense and debugging
2. **Testing**: Run `npm test` or use the Vitest extension
3. **Linting**: Automatic ESLint integration
4. **Building**: Use `npm run build` for production builds

## Customization

### Adding VS Code Extensions

Edit `.devcontainer/devcontainer.json` and add to the `extensions` array:

```json
"extensions": [
  "existing.extension",
  "new.extension-id"
]
```

### Modifying Firewall Rules

Edit `.devcontainer/init-firewall.sh` to adjust network access:

```bash
# Allow specific external service
sudo iptables -A OUTPUT -p tcp --dport 443 -d api.example.com -j ACCEPT
```

### Adding System Dependencies

Modify `.devcontainer/Dockerfile` to install additional packages:

```dockerfile
RUN apt-get update && apt-get install -y \
    your-package-name \
    && rm -rf /var/lib/apt/lists/*
```

## Troubleshooting

### Container Won't Start

1. Check Docker Desktop is running
2. Verify Remote-Containers extension is installed
3. Check Docker has sufficient resources allocated

### Network Issues

1. Review firewall logs: `sudo iptables -L -v -n`
2. Check if service needs additional ports in `init-firewall.sh`
3. Verify DNS resolution: `nslookup google.com`

### Extension Issues

1. Reload VS Code window: `Ctrl+Shift+P` → "Developer: Reload Window"
2. Check extension installation in Extensions tab
3. Review devcontainer.json configuration

## Security Considerations

- **Isolation**: Container provides process and network isolation
- **Minimal attack surface**: Only necessary ports and services exposed
- **Audit trail**: Network access is logged and controlled
- **Non-root user**: Development work runs as `vscode` user

For additional security, consider running the container in a dedicated VM or using Docker's rootless mode.
