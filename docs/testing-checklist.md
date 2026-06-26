# Estratégia de Testes do Lumina

## Objetivo

Orientar o fluxo de testes e garantia de qualidade para a aplicação.

## Tipos de teste

## Smoke Test
teste rápido para saber se o app ainda funciona.

## Soak Test
teste de duração para detectar leak, lag, logs excessivos, underruns e queda de performance.

## Diagnósticos de áudio
valida clipping, headroom, limiter, phase correlation e governor risk.

## Testes de download
valida busca, info, yt-dlp, FFmpeg, biblioteca e fila.

## Testes de build
valida Vite/backend/static e futuro executável.

## Testes que ainda não existem

## Backlog de automação
- CI com npm run build.
- Lint por categoria.
- Testes unitários para utils.
- Testes para normalização de estado de download.
- Testes para sanitização de Health Snapshot.
- Testes para API client.
- Teste smoke de backend.
- Teste de build desktop.

## Quando rodar cada teste

Antes de PR:
- npm run build
- smoke checklist básico

Antes de merge:
- smoke completo
- Soak 5 min
- Health Snapshot exportado

Antes de release:
- Soak 30 ou 60 min
- build desktop
- download real
- player real

## Checklist antes de PR

## Checklist antes de merge
