# AudioFlow

Extensão Chrome para download de áudio MP3 de vídeos do YouTube. Desenvolvida com Chrome Extension (Manifest V3) e servidor Node.js, oferece uma interface moderna e intuitiva para conversão de vídeos do YouTube em arquivos de áudio de alta qualidade.

## Preview

![Preview 1](https://i.imgur.com/TZDfgbB.png)

## Getting Started

Instruções para configurar e executar o projeto localmente.

### Prerequisites

Requisitos para executar o projeto:

- Node.js 18+
- Python 3.x (para yt-dlp)
- FFmpeg (opcional, mas recomendado para conversão MP3)
- Google Chrome ou navegador baseado em Chromium
- Git

### Installing

Passo a passo para configurar o ambiente de desenvolvimento:

1. Clone o repositório
   ```bash
   git clone https://github.com/VTZanetti/ExtensionFlow.git
   cd ExtensionFlow
   ```

2. Configure as variáveis de ambiente
   
   Crie um arquivo `.env` na raiz do projeto baseado no `.env.example`:
   ```env
   SERVER_HOST=localhost
   SERVER_PORT=3000
   AUDIO_QUALITY=0
   CLEANUP_INTERVAL_HOURS=1
   TEMP_DIR=temp
   ```

3. Instale as dependências do servidor
   ```bash
   cd server
   npm install
   ```

4. Configure a extensão
   
   Edite o arquivo `extension/config.js` se necessário para configurar o host e porta do servidor:
   ```javascript
   const AUDIOFLOW_CONFIG = {
       SERVER_HOST: 'localhost',
       SERVER_PORT: 3000
   };
   ```

5. Carregue a extensão no Chrome
   - Abra `chrome://extensions/`
   - Ative o "Modo do desenvolvedor"
   - Clique em "Carregar sem compactação"
   - Selecione a pasta `extension`

### Running

Execute o arquivo `start.bat` que iniciará automaticamente o servidor, ou execute manualmente:

**Servidor:**
```bash
cd server
npm install
npm start
```

O servidor estará disponível em `http://localhost:3000` (ou conforme configurado no `.env`).

**Para usar a extensão:**
1. Certifique-se de que o servidor está rodando
2. Navegue até um vídeo do YouTube
3. Clique no ícone da extensão AudioFlow
4. Clique em "Download MP3"

## Deployment

Para produção, considere:

- Configurar variáveis de ambiente apropriadas no `.env`
- Usar um servidor dedicado para o backend
- Configurar HTTPS para o servidor
- Implementar rate limiting
- Adicionar autenticação se necessário
- Configurar backup dos arquivos temporários se necessário

## Built With

- [Chrome Extension API](https://developer.chrome.com/docs/extensions/) - API para extensões do Chrome (Manifest V3)
- [Node.js](https://nodejs.org/) - Runtime JavaScript para o servidor
- [Express.js](https://expressjs.com/) - Framework web para Node.js
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - Ferramenta para download de vídeos do YouTube
- [FFmpeg](https://ffmpeg.org/) - Ferramenta para conversão de áudio/vídeo
- [dotenv](https://github.com/motdotla/dotenv) - Gerenciamento de variáveis de ambiente

## Contributing

Contribuições são bem-vindas. Por favor:

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## Authors

- [**Vitor Zanetti**](https://github.com/VTZanetti) - *Criador do Projeto*

## License

Este projeto está licenciado sob a Licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes.
