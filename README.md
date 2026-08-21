# Multicode

[![CI](https://github.com/n8nfelipe/multicode/actions/workflows/ci.yml/badge.svg)](https://github.com/n8nfelipe/multicode/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Central local de operações para delegar tarefas a agentes de IA e acompanhar cada execução em um quadro Kanban.

O Multicode conecta o fluxo visível de tarefas à execução real de agentes locais. Uma tarefa pode ser atribuída ao OpenCode, ao Hermes ou a vários agentes em paralelo, com prompts individuais, saída ao vivo, histórico de execução e recuperação de falhas.

## Visão geral

O projeto é um MVP local, single-user e sem autenticação própria. Ele roda na mesma máquina em que os CLIs dos agentes estão instalados e persiste o estado do quadro em um arquivo JSON local.

O fluxo principal é:

1. Criar ou configurar um agente.
2. Criar uma tarefa com título, contexto, prioridade e prompts.
3. Atribuir a tarefa a um ou mais agentes.
4. Acompanhar a fila, a saída e o estado da execução.
5. Inspecionar falhas, conversar com o agente e tentar novamente.

## Funcionalidades

- Quadro com as raias `Agentes`, `Inicial`, `Fazendo`, `Falha` e `Finalizado`.
- Cadastro de agentes OpenCode e Hermes.
- Modelo configurável por agente.
- Login do OpenCode com conta OpenAI pelo fluxo OAuth no navegador.
- Tarefas com prioridade `normal`, `alta` ou `urgente`.
- Contexto comum para todos os agentes de uma tarefa.
- Prompts individuais para cada agente atribuído.
- Execução paralela da mesma tarefa por múltiplos agentes.
- Fila sequencial por agente.
- Atualização automática do quadro a cada três segundos.
- Saída padrão e erros transmitidos durante a execução.
- Timeout configurável e encerramento do processo do agente.
- Retry de tarefas com falha ou travadas.
- Conversa com o agente a partir de uma tarefa na raia `Falha`.
- Histórico de execuções e mensagens persistido no quadro.
- Arrastar tarefas entre as raias do quadro.

## Requisitos

- Node.js 22 ou superior.
- pnpm 11.22.0 ou compatível.
- OpenCode CLI para agentes do provider `opencode`.
- Hermes CLI para agentes do provider `hermes`.
- Credenciais configuradas nos CLIs usados pelos agentes.

O Multicode não armazena credenciais de provider. Os comandos são executados pelo usuário do processo do servidor, com o ambiente e as permissões desse usuário.

## Instalação

Clone o repositório e instale as dependências:

```bash
git clone https://github.com/n8nfelipe/multicode.git
cd multicode
pnpm install
```

Crie a configuração local:

```bash
cp .env.example .env.local
```

Confira se os CLIs estão disponíveis no `PATH` ou ajuste os caminhos no `.env.local`.

## Configuração dos agentes

### OpenCode

Instale o OpenCode CLI e use o botão `Entrar com OpenAI` na interface para iniciar o fluxo de login no navegador. O Multicode consulta `opencode auth list` para verificar se existe uma entrada OAuth válida.

Agentes OpenCode precisam usar um modelo no formato `openai/modelo`. Se o prefixo `openai/` for omitido, o Multicode o adiciona automaticamente.

### Hermes

Instale o Hermes CLI e autentique o provider que será usado nas execuções. O provider padrão é `openai-codex`, mas pode ser alterado pela variável `HERMES_PROVIDER`.

O comando executado para Hermes segue este formato:

```text
hermes chat --query "..." --provider <provider> --model <modelo> --verbose
```

## Variáveis de ambiente

Todas as variáveis são opcionais. Os valores abaixo são os padrões usados pelo projeto.

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `OPENCODE_BIN` | `opencode` | Caminho ou comando do OpenCode CLI. |
| `HERMES_BIN` | `hermes` | Caminho ou comando do Hermes CLI. |
| `HERMES_PROVIDER` | `openai-codex` | Provider passado ao Hermes. |
| `OPENCODE_AUTH_TIMEOUT_MS` | `300000` | Tempo máximo do login OAuth do OpenCode, em milissegundos. |
| `AGENT_EXECUTION_TIMEOUT_MS` | `900000` | Tempo máximo de uma execução de agente, em milissegundos. |

Exemplo para CLIs instalados fora do `PATH`:

```dotenv
OPENCODE_BIN=/caminho/para/opencode
HERMES_BIN=/caminho/para/hermes
HERMES_PROVIDER=openai-codex
OPENCODE_AUTH_TIMEOUT_MS=300000
AGENT_EXECUTION_TIMEOUT_MS=900000
```

Não commite `.env.local` ou qualquer arquivo com credenciais. Esses arquivos são ignorados pelo Git.

## Desenvolvimento

Inicie o servidor local vinculado ao loopback:

```bash
pnpm dev -- --hostname 127.0.0.1
```

Abra [http://127.0.0.1:3000](http://127.0.0.1:3000).

O quadro é carregado inicialmente e atualizado automaticamente a cada três segundos. O servidor precisa continuar em execução para que a fila local processe os agentes.

## Scripts

| Comando | Finalidade |
| --- | --- |
| `pnpm dev -- --hostname 127.0.0.1` | Inicia o servidor de desenvolvimento. |
| `pnpm build` | Gera o build de produção. |
| `pnpm start -- --hostname 127.0.0.1` | Inicia o build de produção localmente. |
| `pnpm lint` | Executa o ESLint. |
| `pnpm typecheck` | Verifica os tipos TypeScript sem emitir arquivos. |
| `pnpm test` | Executa os testes unitários. |
| `pnpm test:coverage` | Executa os testes com cobertura V8. |

Para validar uma alteração antes de abrir um pull request:

```bash
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm build
```

## Persistência local

O estado do quadro é salvo em:

```text
.data/board.json
```

Esse arquivo é criado automaticamente na primeira leitura do quadro, junto com dados iniciais de exemplo. O diretório `.data/` é ignorado pelo Git.

Para reiniciar o ambiente local e recriar os dados iniciais, pare o servidor e remova o arquivo:

```bash
rm -f .data/board.json
```

Faça backup desse arquivo se precisar preservar tarefas, execuções e conversas. A persistência atual usa acesso direto ao filesystem e não é adequada para múltiplos processos ou múltiplos usuários concorrentes.

## Como o fluxo funciona

### Criação e atribuição

Uma tarefa sem agente permanece na raia `Inicial`. Ao atribuir um agente, ela passa para `Fazendo` e entra na fila daquele agente.

Uma tarefa pode ter várias atribuições. Cada agente recebe o contexto comum e o seu prompt individual. As execuções de agentes diferentes podem ocorrer em paralelo.

### Execução

Cada agente tem uma fila sequencial própria. Enquanto um agente executa uma tarefa, as próximas tarefas dele aguardam na fila. A execução registra:

- Status `queued`, `running`, `succeeded`, `failed` ou `stuck`.
- Horário de enfileiramento, início e conclusão.
- Código de saída do processo.
- Saída padrão acumulada.
- Erro acumulado.

Uma execução OpenCode só é considerada concluída quando o processo retorna código zero e a saída termina com `TASK_RESULT: SUCCESS`. Para o Hermes, o código de saída zero é suficiente.

### Falhas e recuperação

Execuções com erro vão para `Falha`. Execuções que excedem `AGENT_EXECUTION_TIMEOUT_MS` ficam como `stuck` e os processos são encerrados.

Na raia `Falha`, é possível:

- Tentar a tarefa novamente.
- Enviar uma orientação adicional para a nova tentativa.
- Perguntar ao agente o que aconteceu.
- Consultar a saída e o erro da última execução.

A conversa com o agente só fica disponível para tarefas na raia `Falha`. Ela serve para diagnóstico e não marca a tarefa como concluída automaticamente.

## API local

### `GET /api/board`

Retorna o quadro atual:

```json
{
  "agents": [],
  "tasks": []
}
```

### `POST /api/board`

Recebe um objeto JSON com `action` e os campos da operação.

| `action` | Campos principais | Efeito |
| --- | --- | --- |
| `create-agent` | `name`, `provider`, `model` | Cria um agente OpenCode ou Hermes. |
| `create-task` | `title`, `priority`, `commonContext`, `assignments` | Cria uma tarefa e, se houver atribuições, inicia suas execuções. |
| `assign-task` | `taskId`, `agentId`, `prompt` | Atribui e inicia uma tarefa da raia `Inicial`. |
| `retry-task` | `taskId`, `message` opcional | Coloca novamente na fila uma tarefa com falha. |
| `message-task` | `taskId`, `message`, `agentId` opcional | Envia uma pergunta ao agente de uma tarefa com falha. |
| `move-task` | `taskId`, `targetStatus` | Move para `initial`, `working`, `failed` ou `finished`. |
| `remove-agent` | `agentId` | Remove um agente sem execução ativa. |
| `remove-task` | `taskId` | Remove uma tarefa que não esteja finalizada. |

O campo `provider` aceita `opencode` ou `hermes`. O campo `priority` aceita `urgent`, `high` ou `normal`.

O campo `assignments` de `create-task` é enviado como uma string JSON com este formato:

```json
[
  {
    "agentId": "agent-id",
    "prompt": "Implemente e valide a tarefa."
  }
]
```

### `GET /api/auth/openai`

Consulta se o OpenCode está disponível e se existe uma autenticação OAuth OpenAI:

```json
{
  "provider": "openai",
  "available": true,
  "authenticated": true
}
```

### `POST /api/auth/openai`

Inicia o login do OpenCode com a conta OpenAI no navegador e retorna o estado atualizado após a autenticação.

## Estrutura do projeto

```text
app/
  api/
    auth/openai/route.ts  # Status e login OpenAI via OpenCode
    board/route.ts        # Leitura e mutações do quadro
  board.tsx               # Interface Kanban e modais
  layout.tsx              # Metadata e shell da aplicação
  page.tsx                # Página principal
lib/
  executors.ts            # Execução dos CLIs e timeouts
  interaction.ts          # Conversa de diagnóstico após falhas
  openai-auth.ts          # Integração de autenticação do OpenCode
  queue.ts                # Fila sequencial por agente
  store.ts                # Persistência em .data/board.json
  types.ts                # Tipos de agentes, tarefas e execuções
.github/workflows/ci.yml  # Qualidade e tags SemVer
```

## Segurança e limitações

- O MVP não possui autenticação de usuário nem autorização por tarefa.
- A API local aceita mutações sem uma camada de autenticação própria.
- Não exponha o servidor em uma rede pública.
- Os agentes executam comandos com as permissões do usuário do servidor.
- A fila e o conjunto de execuções ativas ficam em memória; reiniciar o processo interrompe execuções em andamento.
- A persistência é um arquivo JSON local, sem banco de dados, migrações ou controle de concorrência entre instâncias.
- O login OpenAI depende do OpenCode CLI instalado e acessível.
- O Hermes depende do provider autenticado e disponível no ambiente local.

## CI e versionamento

O workflow do GitHub Actions executa lint, typecheck e testes de cobertura em pull requests e pushes para `main`.

Após a qualidade passar em um push para `main`, o workflow cria uma tag anotada seguindo SemVer:

- `feat:` incrementa o minor.
- `fix:` ou `perf:` incrementa o patch.
- `feat!:` ou `BREAKING CHANGE:` incrementa o major.
- Commits sem um prefixo reconhecido usam incremento patch.

As tags seguem o formato `vMAJOR.MINOR.PATCH`. Na ausência de tags anteriores, a versão de `package.json` é usada como base.

## Contribuição

1. Crie uma branch para a alteração.
2. Configure os CLIs e o `.env.local` apenas se a alteração precisar executar agentes.
3. Faça a alteração e adicione ou atualize testes quando necessário.
4. Execute `pnpm lint`, `pnpm typecheck` e `pnpm test:coverage`.
5. Abra um pull request descrevendo comportamento, limitações e validações realizadas.

Commits podem usar Conventional Commits para expressar o impacto de uma versão, por exemplo:

```text
feat: adicionar filtro de tarefas
fix: preservar erro da execução
feat!: alterar contrato da API
```

## Licença

Este projeto está disponível sob a [licença MIT](LICENSE).
