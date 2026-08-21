# Design System

## Direction

Flow Session: uma sala escura de conversa, com o episódio como objeto principal e a navegação funcionando como uma faixa editorial. A interface evita o catálogo genérico: o visitante escolhe um mergulho, vê contexto e abre a conversa real no YouTube.

## Palette

- Stage: `#111313`
- Surface: `#191d1c`
- Text: `#eef0e9`
- Muted: `#969f99`
- Flow yellow: `#d9ed40`
- Signal red: `#fa583d`
- Rule: `#35403d`

## Typography

Barlow Condensed é a voz de cartaz para títulos, episódios e metadados editoriais. DM Sans sustenta busca, navegação e textos longos com leitura confortável.

## Composition

O header é enxuto e orientado à descoberta. A primeira viewport combina manifesto à esquerda e imagem do episódio em destaque à direita. Abaixo, filtros em faixa horizontal e uma grade de episódios com imagem, convidado, duração, visualizações e data.

## Interaction

Busca e categorias filtram a coleção local sem recarregar. Selecionar um episódio atualiza o destaque. Cada item possui link direto para uma busca contextual no canal oficial do YouTube e o header oferece acesso ao canal.

## Responsive Rules

Desktop usa composição dividida e quatro colunas. Tablet reduz a grade para três colunas. Mobile empilha o destaque, transforma categorias em faixa rolável e usa duas colunas de episódios, com fallback de uma coluna em telas muito estreitas.
