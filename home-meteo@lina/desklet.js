const Desklet = imports.ui.desklet;
const St = imports.gi.St;
const GLib = imports.gi.GLib;
const Mainloop = imports.mainloop;
const Settings = imports.ui.settings;
const Gio = imports.gi.Gio;

function MyDesklet(metadata, desklet_id) {
    this._init(metadata, desklet_id);
}

MyDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function(metadata, desklet_id) {
        try {
            Desklet.Desklet.prototype._init.call(this, metadata, desklet_id);

            this.settings = new Settings.DeskletSettings(this, this.metadata.uuid, desklet_id);
            this.settings.bindProperty(Settings.BindingDirection.IN, "font-size", "fontSize", this._onSettingsChanged, null);
            this.settings.bindProperty(Settings.BindingDirection.IN, "custom-color", "customColor", this._onSettingsChanged, null);
            this.settings.bindProperty(Settings.BindingDirection.IN, "use-custom-color", "useCustomColor", this._onSettingsChanged, null);

            // Главный контейнер
            this.container = new St.BoxLayout({
                style_class: "desklet-with-borders",
                vertical: true,
                style: "padding: 20px; border-radius: 15px; text-align: center; min-width: 250px;"
            });

            // Горизонтальный контейнер для двух колонок
            this.contentBox = new St.BoxLayout({ vertical: false });

            // Колонка Температуры
            this.tempBox = new St.BoxLayout({ vertical: true, style: "margin: 0 15px;" });
            this.labelT = new St.Label({ text: "Температура, °C" });
            this.emojiT = new St.Label({ text: "⏳" });
            this.valT = new St.Label({ text: "00.0" });
            this.tempBox.add_actor(this.labelT);
            this.tempBox.add_actor(this.emojiT);
            this.tempBox.add_actor(this.valT);

            // Колонка Влажности
            this.humBox = new St.BoxLayout({ vertical: true, style: "margin: 0 15px;" });
            this.labelH = new St.Label({ text: "Влажность, %" });
            this.emojiH = new St.Label({ text: "⏳" });
            this.valH = new St.Label({ text: "00.0" });
            this.humBox.add_actor(this.labelH);
            this.humBox.add_actor(this.emojiH);
            this.humBox.add_actor(this.valH);

            this.contentBox.add_actor(this.tempBox);
            this.contentBox.add_actor(this.humBox);

            // Статус внизу
            this.updateLabel = new St.Label({ 
                text: "Запуск системы...", 
                style: "margin-top: 15px; font-size: 0.8em; opacity: 0.6;" 
            });

            this.container.add_actor(this.contentBox);
            this.container.add_actor(this.updateLabel);
            this.setContent(this.container);

            this._onSettingsChanged();
            
            // Запуск чтения через 2 секунды
            Mainloop.timeout_add_seconds(2, () => {
                this._initArduinoRead();
                return false;
            });

        } catch (e) {
            global.logError(e);
        }
    },

    _onSettingsChanged: function() {
        let fs = this.fontSize || 12;
        let color = this.useCustomColor ? this.customColor : "#ffffff";
        
        let headerStyle = "color: " + color + "; font-size: " + (fs * 0.9) + "pt; opacity: 0.8;";
        let emojiStyle = "font-size: " + (fs * 2.1) + "pt; margin: 0 0;";
        let valueStyle = "color: " + color + "; font-weight: bold; font-size: " + (fs * 1.4) + "pt;";

        this.labelT.set_style(headerStyle);
        this.labelH.set_style(headerStyle);
        this.emojiT.set_style(emojiStyle);
        this.emojiH.set_style(emojiStyle);
        this.valT.set_style(valueStyle);
        this.valH.set_style(valueStyle);
        this.updateLabel.set_style("color: " + color + "; font-size: " + (fs * 0.7) + "pt;");
    },

    _initArduinoRead: function() {
        this.arduinoPath = "/dev/arduino";

        if (this.dataStream) {
            try { this.dataStream.close(null); } catch (e) {}
            this.dataStream = null;
        }

        if (!GLib.file_test(this.arduinoPath, GLib.FileTest.EXISTS)) {
            this.updateLabel.set_text("Порт /dev/arduino не найден");
            Mainloop.timeout_add_seconds(5, () => this._initArduinoRead());
            return;
        }

        try {
            // Настройка порта
            GLib.spawn_command_line_sync("stty -F " + this.arduinoPath + " 9600 raw -echo -icanon hupcl");

            let file = Gio.File.new_for_path(this.arduinoPath);
            file.read_async(GLib.PRIORITY_LOW, null, (source, res) => {
                try {
                    let inputStream = source.read_finish(res);
                    this.dataStream = new Gio.DataInputStream({ base_stream: inputStream });
                    this.updateLabel.set_text("Подключено. Ожидание данных...");
                    this._readNext();
                } catch (e) {
                    this.updateLabel.set_text("Ошибка открытия потока");
                    Mainloop.timeout_add_seconds(5, () => this._initArduinoRead());
                }
            });
        } catch (e) {
            this.updateLabel.set_text("Ошибка stty");
            Mainloop.timeout_add_seconds(5, () => this._initArduinoRead());
        }
    },

   _readNext: function() {
        if (!this.dataStream) return;
        this.dataStream.read_line_async(GLib.PRIORITY_LOW, null, (source, res) => {
            try {
                let [line, length] = source.read_line_finish(res);
                if (line !== null) {
                    let text = line.toString().trim();
                    let matches = text.match(/[-+]?[0-9]*\.?[0-9]+/g);
                    
                    if (matches && matches.length >= 2) {
                        let t = parseFloat(matches[0]);
                        let h = parseFloat(matches[1]);
                        let now = GLib.DateTime.new_now_local();

                        this.valT.set_text(t.toFixed(1));
                        this.valH.set_text(h.toFixed(1));

                        // Логика для Температуры
                        if (t > 27) {
                            this.emojiT.set_text("🥵");
                        } else if (t < 22) {
                            this.emojiT.set_text("🥶");
                        } else {
                            this.emojiT.set_text("😊");
                        }

                        // Логика для Влажности
                        if (h < 40) {
                            this.emojiH.set_text("😮‍💨");
                        } else if (h > 60) {
                            this.emojiH.set_text("😶‍🌫️");
                        } else {
                            this.emojiH.set_text("😊");
                        }

                        this.updateLabel.set_text("Обновлено: " + now.format("%H:%M:%S"));
                    }
                }
                this._readNext(); 
            } catch (e) {
                this.updateLabel.set_text("Переподключение...");
                Mainloop.timeout_add_seconds(2, () => this._initArduinoRead());
            }
        });
    },

    on_desklet_removed: function() {
        if (this.dataStream) {
            try { this.dataStream.close(null); } catch (e) {}
        }
        this.settings.finalize();
    }
}

function main(metadata, desklet_id) {
    return new MyDesklet(metadata, desklet_id);
}
