// The one setting, kept as a small JSON file so the extension needs no
// compiled GSettings schema.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {parseSettings} from './parse.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');

const configDir = () => GLib.build_filenamev([GLib.get_user_config_dir(), 'tally']);
const configFile = () => Gio.File.new_for_path(GLib.build_filenamev([configDir(), 'settings.json']));

export async function loadSettings(cancellable) {
    try {
        const [bytes] = await configFile().load_contents_async(cancellable);
        return parseSettings(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
        return parseSettings(null);
    }
}

export async function saveSettings(settings, cancellable) {
    try {
        GLib.mkdir_with_parents(configDir(), 0o700);
        const bytes = new GLib.Bytes(new TextEncoder().encode(`${JSON.stringify(settings, null, 2)}\n`));
        await configFile().replace_contents_bytes_async(
            bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, cancellable);
    } catch {
        // The choice still holds for this session; it is only not remembered.
    }
}
