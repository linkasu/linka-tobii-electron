# @linkasu/tobii-electron

Shared Electron Tobii integration for LINKa apps.

## Exports

- `@linkasu/tobii-electron/main` - Electron main-process trackers and `BackWatch`.
- `@linkasu/tobii-electron/renderer` - renderer `PageWatcher` for DOM eye targets.
- `@linkasu/tobii-electron/electron-builder` - helper functions for `electron-builder` resources.
- `@linkasu/tobii-electron/types` - shared public types.

## Packaging

Consumers must include package helper resources in `electron-builder.extraResources` and unpack native addon files when needed. Use `getTobiiExtraResources()` and `getTobiiAsarUnpackPatterns()` from `@linkasu/tobii-electron/electron-builder`.

## Лицензия

Собственный программный код LINKa в этом репозитории распространяется на условиях
GNU General Public License версии 3 или, по выбору получателя, любой более поздней
версии (SPDX: `GPL-3.0-or-later`). Полный неизменённый текст GPLv3: [LICENSE](LICENSE).

Разрешены использование, форки, изменения и коммерческое использование. При
распространении покрываемого GPL кода и производных программ необходимо соблюдать
GPL: сохранять уведомления об авторстве, лицензии и отсутствии гарантий, отмечать
изменения и их даты, предоставлять соответствующий исходный код получателям и
лицензировать покрываемую производную программу на условиях GPL. Личные изменения,
которые не распространяются, публиковать не требуется. Гарантии не предоставляются
в пределах разделов 15–16 GPLv3.

Авторы и правообладатели сохраняют права на свои вклады; существующие имена и годы
авторства сохраняются в исходниках, уведомлениях и истории Git. Поддержка или участие
АНО «Линка» сами по себе не означают передачу ей исключительных прав. Copyright FSF
в тексте GPL относится к тексту лицензии, а не к авторству программы. Ранее
предоставленные права на версии под MIT/BSD/ISC не отзываются.

Эта GPL-декларация относится только к собственному программному коду и не
перелицензирует сторонний код, SDK/DLL Tobii, Unity-компоненты, зависимости,
изображения, звуки, шрифты, бренды и учебные материалы. Их исходные лицензии,
атрибуция и ограничения сохраняются; права на товарные знаки не предоставляются.
Публичная доступность файла не заменяет разрешение правообладателя. Совместимость
всей готовой сборки с GPL и права на материалы без подтверждённой лицензии этим
изменением не устанавливаются.

Конкретные исключения и сохранённые уведомления: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
