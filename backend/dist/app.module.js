"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const casino_gateway_1 = require("./casino/casino.gateway");
const twitch_service_1 = require("./twitch/twitch.service");
const path = require("path");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: [
                    path.resolve(process.cwd(), '.env'),
                    path.resolve(process.cwd(), '..', '.env'),
                    path.resolve(process.cwd(), 'backend', '.env'),
                    path.resolve(__dirname, '..', '..', '.env'),
                    path.resolve(__dirname, '..', '.env'),
                ],
            }),
        ],
        providers: [casino_gateway_1.CasinoGateway, twitch_service_1.TwitchService],
        exports: [casino_gateway_1.CasinoGateway, twitch_service_1.TwitchService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map