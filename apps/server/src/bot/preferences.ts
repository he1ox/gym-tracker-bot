import type { MiddlewareFn } from 'grammy';
import { setCurrent } from '../i18n/current';
import type { CustomContext } from './context';

/**
 * Copia las preferencias del usuario al estado global antes de cada update.
 * Va SIEMPRE detrás de auth: necesita ctx.user ya resuelto.
 */
export function preferences(): MiddlewareFn<CustomContext> {
  return async (ctx, next) => {
    setCurrent({
      locale: ctx.user.locale,
      unit: ctx.user.weightUnit,
      step: ctx.user.weightStep,
    });
    await next();
  };
}
