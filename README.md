# TeleKart

Cronômetro de voltas por GPS para kart, inspirado na experiência de uso do RaceChrono, feito para o Circuito Internacional Paladino (Conde-PB). Projeto de estudo em Expo (React Native + TypeScript) para Android e iOS.

Não tem kart nem pista? Use o modo **Simular voltas**: um kart virtual roda no traçado e você vê o cronômetro, a melhor volta e o delta funcionando em casa.

Status: testado na pista em um Android. Os tempos de volta ficaram muito próximos dos de um cronômetro externo.

## Instalar no Android (APK)

Baixe o APK na [última release](https://github.com/JoaoVictorMachadoSantos01/TeleKart/releases/latest) e instale no celular (o Android vai pedir para permitir a instalação de fontes desconhecidas).

O app roda sozinho, sem PC e sem internet. A internet só é usada pelo mapa do editor de circuitos e para o GPS achar a posição mais rápido.

## iPhone

Por enquanto não há build para iOS. No iPhone, o app roda só pelo **Expo Go**, seguindo os passos de [Rodar em desenvolvimento](#rodar-em-desenvolvimento).

## Rodar em desenvolvimento

```sh
cd app
npm install
npx expo start
```

Instale o app **Expo Go** no celular e leia o QR code (no iPhone, pela câmera). Celular e computador precisam estar na mesma rede Wi-Fi.

## Usando o app

- **Iniciar sessão (GPS)**: usa o GPS do celular. A tela fica acesa, e a contagem de voltas começa na primeira vez que você cruza a linha de chegada.
- **Simular voltas**: um kart virtual roda no traçado do Paladino com GPS a 10 Hz e ruído. Serve para testar em casa.
- **Parar**: segure o botão por quase 1 s, para não parar sem querer.
- **Circuitos**: toque no card do circuito na tela inicial.
  - **Novo circuito**: no mapa de satélite, toque pontos pelo meio da pista no sentido da corrida, ajuste a largura (o app desenha os limites) e marque a linha de chegada com dois toques. A bolinha verde maior é o primeiro ponto, e a seta verde mostra o sentido. Para arrastar um ponto, segure o dedo nele antes de mover.
  - **Compartilhar**: envia um arquivo `.telekart.json` por WhatsApp, e-mail, Drive etc.
  - **Importar arquivo**: adiciona um circuito recebido de outra pessoa.

## Gerar seu próprio build (Android)

O build é feito na nuvem pelo [EAS](https://docs.expo.dev/build/introduction/) e precisa de uma conta Expo:

```sh
cd app
npx eas-cli login
npx eas-cli build -p android --profile preview
```

No fim, abra no celular o link/QR code que aparece, baixe e instale o APK.

- **Chave do Google Maps** (mapa do editor no Android): fica na variável de ambiente `GOOGLE_MAPS_API_KEY`, lida pelo `app.config.ts`. Nunca deve ir para o git. Nos builds, ela vem das variáveis do EAS (`npx eas-cli env:list`). Para rodar localmente, coloque a chave em `app/.env.local`. A chave deve ficar restrita no Google Cloud ao pacote `com.telekart.app` + SHA-1 (`npx eas-cli credentials -p android`).
- `app/.npmrc` usa `legacy-peer-deps=true`. Sem ele, o `npm ci` do EAS falha por um conflito de peer deps do próprio Expo (`react-native-worklets`).

## Testes

```sh
cd app
npm test          # motor de cronometragem (node --test)
npm run typecheck
```

## Estrutura

- `app/src/core/`: motor em TypeScript puro, sem React. Usa técnicas conhecidas de cronometragem por GPS: interseção do trajeto com a linha de chegada e interpolação do horário do cruzamento, projeção da posição na linha central da pista para medir a distância na volta, e delta comparando o tempo atual com o da melhor volta na mesma distância.
  - `geo.ts`: distância, rumo, projeção local e interseção de segmentos.
  - `track.ts`: pista, linha de chegada (centro + rumo + largura) e projeção na linha central.
  - `lapTimer.ts`: cruzamento com interpolação do tempo, montagem de voltas, melhor volta, delta e prevista.
  - `simulator.ts`: kart virtual usado nos testes e no modo simulação.
  - `trackFile.ts`: formato de arquivo `.telekart.json` para compartilhar circuitos.
  - `trackEdit.ts`: inserir ponto, inverter sentido e simplificar traçado.
- `app/src/app/`: telas (Expo Router), com início, ao vivo e detalhe da sessão.
- `app/src/trackStore.ts`: circuitos do usuário, circuito em uso, exportar e importar.
- `app/src/storage.ts`: sessões em JSON no armazenamento do app. Resumo e amostras brutas ficam em arquivos separados (formato colunar).
- `app/eas.json` e `app/app.config.ts`: perfis de build do EAS e configuração do app (chave do Maps via env).
- `data/tracks/paladino.json`: traçado do Paladino; cópia em `app/src/tracks/`.

## Créditos

- Traçado do Circuito Internacional Paladino obtido do [FoxLap](https://foxlap.com/260/track-Circuito_internacional_Paladino_Brazil.html). Os direitos sobre esses dados são do FoxLap e de seus autores.
- Interface inspirada na experiência de uso do RaceChrono. O TeleKart não tem ligação com o RaceChrono nem com o FoxLap.

## Contribuir

Ideias e correções são bem-vindas. Veja as [issues](https://github.com/JoaoVictorMachadoSantos01/TeleKart/issues) abertas.

## Licença

[MIT](LICENSE)
