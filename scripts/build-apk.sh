#!/usr/bin/env bash
set -euo pipefail

# Script auxiliar para validar o projeto e gerar o APK Android do TEA Autonomia.
#
# Uso:
#   ./scripts/build-apk.sh [local|eas|check] [opções]
#
# Modos:
#   local   (padrão) Valida o código, gera a pasta nativa e compila o APK release localmente (exige JDK 17)
#   eas     Valida o código e dispara o build preview no EAS (npx eas build -p android --profile preview)
#   check   Executa apenas lint, typecheck, testes e validação do bundle (npx expo export)
#
# Opções:
#   --jdk17 <caminho>        Caminho explícito do JDK 17 (alternativa a JAVA_HOME/JDK17_HOME)
#   --android-sdk <caminho>  Caminho explícito do Android SDK (alternativa a ANDROID_HOME)
#   --skip-install           Pula `npm install`
#   --skip-checks            Pula `lint`, `typecheck` e `test`
#   --skip-export            Pula `npx expo export --platform android`
#   --skip-prebuild          Pula `npx expo prebuild -p android` (apenas modo local)
#   -h, --help               Exibe esta ajuda

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="local"
JDK17_PATH="${JDK17_HOME:-${JAVA_HOME:-}}"
ANDROID_SDK_PATH=""
SKIP_INSTALL=false
SKIP_CHECKS=false
SKIP_EXPORT=false
SKIP_PREBUILD=false

print_help() {
  sed -n '3,22p' "$0" | sed 's/^# \{0,1\}//'
}

log_step() {
  printf '\n==> %s\n' "$1"
}

die() {
  printf 'Erro: %s\n' "$1" >&2
  exit 1
}

is_jdk17() {
  local candidate="$1"
  [[ -n "$candidate" && -x "$candidate/bin/java" ]] || return 1
  local version
  version="$("$candidate/bin/java" -version 2>&1 | head -n 1)"
  [[ "$version" == *'"17.'* ]]
}

find_jdk17() {
  if [[ -n "$JDK17_PATH" ]]; then
    if is_jdk17 "$JDK17_PATH"; then
      echo "$JDK17_PATH"
      return 0
    fi
    die "O caminho informado não é um JDK 17 válido: $JDK17_PATH (AGP 8.1.1 do Expo SDK 50 exige JDK 17 e falha com JDK 21+)."
  fi

  local candidates=(
    /usr/lib/jvm/java-17-openjdk*
    /usr/lib/jvm/java-17-temurin*
    /usr/lib/jvm/temurin-17*
    /usr/lib/jvm/jdk-17*
    /usr/lib/jvm/zulu-17*
    /Library/Java/JavaVirtualMachines/*17*/Contents/Home
  )

  local dir
  for dir in "${candidates[@]}"; do
    if is_jdk17 "$dir"; then
      echo "$dir"
      return 0
    fi
  done

  if command -v /usr/libexec/java_home >/dev/null 2>&1; then
    local mac_jdk
    mac_jdk="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
    if is_jdk17 "$mac_jdk"; then
      echo "$mac_jdk"
      return 0
    fi
  fi

  return 1
}

is_android_sdk() {
  local candidate="$1"
  [[ -n "$candidate" && -d "$candidate" ]] || return 1
  [[ -d "$candidate/platforms" || -d "$candidate/platform-tools" || -d "$candidate/cmdline-tools" ]]
}

find_android_sdk() {
  if [[ -n "$ANDROID_SDK_PATH" ]]; then
    if is_android_sdk "$ANDROID_SDK_PATH"; then
      echo "$ANDROID_SDK_PATH"
      return 0
    fi
    die "O caminho informado não parece um Android SDK válido: $ANDROID_SDK_PATH"
  fi

  local candidates=(
    "${ANDROID_HOME:-}"
    "${ANDROID_SDK_ROOT:-}"
    "$HOME/Android/Sdk"
    "$HOME/Library/Android/sdk"
    "/opt/android-sdk"
  )

  local dir
  for dir in "${candidates[@]}"; do
    if is_android_sdk "$dir"; then
      echo "$dir"
      return 0
    fi
  done

  return 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    local|eas|check)
      MODE="$1"
      shift
      ;;
    --jdk17)
      [[ $# -ge 2 ]] || die "Informe o caminho após --jdk17."
      JDK17_PATH="$2"
      shift 2
      ;;
    --android-sdk)
      [[ $# -ge 2 ]] || die "Informe o caminho após --android-sdk."
      ANDROID_SDK_PATH="$2"
      shift 2
      ;;
    --skip-install)
      SKIP_INSTALL=true
      shift
      ;;
    --skip-checks)
      SKIP_CHECKS=true
      shift
      ;;
    --skip-export)
      SKIP_EXPORT=true
      shift
      ;;
    --skip-prebuild)
      SKIP_PREBUILD=true
      shift
      ;;
    -h|--help)
      print_help
      exit 0
      ;;
    *)
      die "Argumento desconhecido: $1 (use --help para ver as opções)."
      ;;
  esac
done

# 1. Dependências
if [[ "$SKIP_INSTALL" == false ]]; then
  log_step "Instalando dependências (npm install)"
  npm install
fi

# 2. Validação de código
if [[ "$SKIP_CHECKS" == false ]]; then
  log_step "Executando lint, typecheck e testes"
  npm run lint
  npm run typecheck
  npm test
fi

# 3. Validação do bundle Android
if [[ "$SKIP_EXPORT" == false ]]; then
  log_step "Validando bundle Android (npx expo export --platform android)"
  npx expo export --platform android
fi

if [[ "$MODE" == "check" ]]; then
  log_step "Validações concluídas com sucesso!"
  exit 0
fi

# 4a. Build via EAS
if [[ "$MODE" == "eas" ]]; then
  log_step "Iniciando build Android preview no EAS"
  npx eas build -p android --profile preview
  exit 0
fi

# 4b. Build local (APK Release)
log_step "Verificando JDK 17"
RESOLVED_JDK17="$(find_jdk17 || true)"
if [[ -z "$RESOLVED_JDK17" ]]; then
  die "JDK 17 não encontrado. O AGP 8.1.1 do Expo SDK 50 exige JDK 17 (falha com JDK 21+). Instale o JDK 17 ou informe o caminho com: ./scripts/build-apk.sh --jdk17 /caminho/para/jdk17"
fi
echo "Usando JDK 17 em: $RESOLVED_JDK17"

log_step "Verificando Android SDK"
RESOLVED_ANDROID_SDK="$(find_android_sdk || true)"
if [[ -z "$RESOLVED_ANDROID_SDK" ]]; then
  die "Android SDK não encontrado (ANDROID_HOME='${ANDROID_HOME:-}'). Instale o Android SDK ou informe o caminho com: ./scripts/build-apk.sh --android-sdk /caminho/para/Android/Sdk"
fi
if [[ -n "${ANDROID_HOME:-}" && "$ANDROID_HOME" != "$RESOLVED_ANDROID_SDK" ]]; then
  echo "Aviso: ANDROID_HOME ($ANDROID_HOME) indisponível; usando $RESOLVED_ANDROID_SDK"
else
  echo "Usando Android SDK em: $RESOLVED_ANDROID_SDK"
fi

if [[ "$SKIP_PREBUILD" == false ]]; then
  log_step "Gerando projeto nativo Android (npx expo prebuild -p android)"
  npx expo prebuild -p android
fi

[[ -x "$ROOT_DIR/android/gradlew" ]] || die "android/gradlew não encontrado. Execute sem --skip-prebuild para gerar a pasta nativa."

# Garante que o Gradle encontre o SDK real mesmo quando ANDROID_HOME do sistema estiver incorreto
printf 'sdk.dir=%s\n' "$RESOLVED_ANDROID_SDK" > "$ROOT_DIR/android/local.properties"

log_step "Compilando APK release (assembleRelease)"
(
  cd "$ROOT_DIR/android"
  JAVA_HOME="$RESOLVED_JDK17" \
  ANDROID_HOME="$RESOLVED_ANDROID_SDK" \
  ANDROID_SDK_ROOT="$RESOLVED_ANDROID_SDK" \
  PATH="$RESOLVED_JDK17/bin:$PATH" \
  ./gradlew assembleRelease -Dorg.gradle.java.home="$RESOLVED_JDK17"
)

APK_PATH="$ROOT_DIR/android/app/build/outputs/apk/release/app-release.apk"
if [[ -f "$APK_PATH" ]]; then
  APK_SIZE="$(du -h "$APK_PATH" | cut -f1)"
  log_step "APK gerado com sucesso!"
  echo "Arquivo: $APK_PATH ($APK_SIZE)"
else
  log_step "Build finalizado. Verifique os APKs em: $ROOT_DIR/android/app/build/outputs/apk/release/"
fi
