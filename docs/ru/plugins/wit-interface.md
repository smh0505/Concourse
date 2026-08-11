# WIT-интерфейс

Это фактический контракт [WIT](https://component-model.bytecodealliance.org/design/wit.html),
на основе которого собирается каждый WASM-плагин - источник истины - `src-tauri/wit/plugin.wit`
в основном репозитории; эта страница его объясняет, но именно этот файл имеет приоритет, если
они когда-либо разойдутся.

## Интерфейс `host`

Каждая функция хоста ниже - это возможность, которую реализует и предоставляет вашему плагину
Rust-хост, - намеренно общие примитивы (реестр/файлы/процессы/сеть/ограниченное хранилище), а не
семантические функции для конкретной интеграции. Плагин source сам компонует их (например,
разбирая собственный формат VDF/XML поставщика) вместо того, чтобы Concourse писал отдельный
специализированный модуль под каждый источник.

### Реестр (Windows)

```wit
read-registry-string: func(hive: string, path: string, value: string) -> option<string>;
list-registry-keys: func(hive: string, path: string) -> result<list<string>, string>;
```

`hive` - это `"HKLM"` или `"HKCU"`. Отсутствующий ключ/значение возвращает `none`/пустой список,
а не ошибку - "не существует" является нормальным, ожидаемым результатом (например, при проверке,
установлена ли платформа вообще).

### Файловая система

```wit
read-file: func(path: string) -> result<string, string>;
write-file: func(path: string, contents: string) -> result<_, string>;
list-dir: func(path: string) -> result<list<string>, string>;
path-exists: func(path: string) -> bool;
remove-dir: func(path: string) -> result<_, string>;
plugin-dir: func() -> result<string, string>;
```

`plugin-dir()` возвращает собственную доступную для записи директорию этого плагина
(`<app data>/wasm-plugins/<kind>/<plugin-id>/`) - всегда неявно доступна на чтение/запись. Любой
другой путь должен попадать в область, объявленную вашим манифестом, либо быть запрошен во время
выполнения (см. [Модель безопасности](./security-model#path-scoping)).

```wit
request-read-scope: func(path: string) -> result<_, string>;
```

Для директории, обнаруживаемой во время выполнения, а не известной статически (например, там,
куда пользователь на самом деле установил Steam) - хост предоставляет это только если распознаёт
id вашего плагина *и* путь проходит реальную структурную проверку для этого поставщика.

### Процессы

```wit
spawn-process: func(path: string, args: list<string>) -> result<_, string>;
run-and-wait: func(path: string, args: list<string>, cwd: string) -> result<_, string>;
```

`spawn-process` - это запуск без ожидания (fire-and-forget, нет ожидания/кода выхода) -
соответствует тому, как `launch()` используется в остальной части системы; собственное
отслеживание игрового времени Concourse на основе папок покрывает длительность сессии отдельно.
`run-and-wait` блокируется до завершения процесса, для случаев, которые действительно этого
требуют (например, видимое окно стороннего установщика, о закрытии которого вашему плагину нужно
узнать перед продолжением). Обе функции требуют предоставления возможности `"run-programs"` - см.
[Модель безопасности](./security-model).

### Сеть

```wit
http-get: func(url: string) -> result<string, string>;
download-bytes: func(url: string) -> result<list<u8>, string>;
http-request: func(method: string, url: string, headers: list<tuple<string, string>>, body: option<string>) -> result<string, string>;
```

`http-request` предназначена для всего, что не может выразить `http-get` - кастомные заголовки
(bearer-токен `Authorization`) или метод, отличный от GET, с телом (например, API запросов на
основе POST). Используйте `download-bytes` вместо `http-get`/`http-request` для бинарных ответов.

### Zip-архивы

```wit
extract-zip: func(bytes: list<u8>, dest-dir: string) -> result<_, string>;
unwrap-single-subdir: func(dir: string) -> result<string, string>;
replace-dir: func(src: string, dest: string) -> result<_, string>;
```

Вместе они покрывают распространённый поток "скачать zip релиза, распаковать и установить его"
(используется плагинами `wrapper` для собственных управляемых установок). `unwrap-single-subdir`
обрабатывает распространённый случай, когда zip релиза оборачивает своё содержимое в одну папку
верхнего уровня, соответствующую имени архива.

### Ограниченное хранилище

```wit
settings-get: func(key: string) -> option<string>;
settings-set: func(key: string, value: string);
plugin-data-get: func(game-id: s64, key: string) -> option<string>;
plugin-data-set: func(game-id: s64, key: string, value: string);
```

Обе автоматически изолированы по неймспейсу хостом для каждого id плагина - ваш плагин никогда
не может читать или писать настройки другого плагина или данные по конкретной игре другого
плагина, либо напрямую обращаться к основной таблице приложения.

## Три мира плагинов

Каждый `kind`, который может реализовать WASM-плагин, экспортирует один из этих миров:

### `source-plugin-world`

```wit
interface source-plugin {
    use host.{game-entry};

    scan: func() -> result<list<game-entry>, string>;
    launch: func(entry: game-entry) -> result<_, string>;
    get-install-status: func(entry: game-entry) -> result<bool, string>;
}
```

Отражает встроенный TypeScript-интерфейс `SourcePlugin` - WASM-плагин source является
подключаемой альтернативной реализацией того же контракта. См. [Начало
работы](./getting-started) для полного пошагового руководства по его реализации.

### `wrapper-plugin-world`

```wit
interface wrapper-plugin {
    use host.{locale-profile};

    install: func() -> result<_, string>;
    uninstall: func() -> result<_, string>;
    is-installed: func() -> bool;

    list-profiles: func() -> result<list<locale-profile>, string>;
    launch: func(profile-guid: string, executable-path: string) -> result<_, string>;
}
```

Обёртка совместимости (например, локальный эмулятор) - полностью самодостаточная. `install()`
скачивает последний релиз, распаковывает его, засеивает конфигурацию профиля по умолчанию, если
её ещё нет, и запускает настоящий установщик поставщика для того шага регистрации, который может
выполнить только он. В отличие от плагинов source, здесь нет пути, принадлежащего хосту, который
нужно было бы куда-либо передавать, - плагин всегда устанавливается в (и разрешает) одно и то же
детерминированное расположение внутри собственного `plugin-dir()`.

### `metadata-plugin-world`

```wit
interface metadata-plugin {
    record metadata-result {
        description: option<string>,
        release-date: option<string>,
        genres: list<string>,
        cover-art-url: option<string>,
        background-art-url: option<string>,
    }

    record metadata-candidate {
        id: string,
        label: string,
        image-url: option<string>,
    }

    search-candidates: func(title: string) -> result<list<metadata-candidate>, string>;
    fetch-metadata-by-id: func(id: string) -> result<option<metadata-result>, string>;
}
```

`search-candidates` возвращает каждое правдоподобное совпадение - обычно 0 или 1, но может быть
больше, когда собственные списки вашего поставщика действительно неоднозначны (например,
дубликат/переиздание с тем же названием). Хост автоматически выбирает единственного кандидата,
когда возвращается ровно один, показывает пользователю выбор, когда возвращается больше одного, и
полностью пропускает вашего поставщика, когда не возвращается ни одного. `fetch-metadata-by-id`
затем получает полные метаданные для одного конкретного кандидата по его `id`.

## `game-entry` и `locale-profile`

```wit
record game-entry {
    id: string,
    title: string,
    executable-path: string,
    platform: string,
    cover-art-url: option<string>,
    install-dir: option<string>,
}

record locale-profile {
    name: string,
    guid: string,
}
```
