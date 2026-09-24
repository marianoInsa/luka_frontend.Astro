import { describe, expect, it } from 'vitest';

import { CSV_HEADER, csvField, csvRecordLine, pythonFloatString } from './csv';

describe('pythonFloatString', () => {
  it('agrega el .0 que JS omite en los enteros', () => {
    expect(pythonFloatString(1500)).toBe('1500.0');
    expect(pythonFloatString(0)).toBe('0.0');
    expect(pythonFloatString(12000)).toBe('12000.0');
  });

  it('preserva los decimales', () => {
    expect(pythonFloatString(1234.56)).toBe('1234.56');
    expect(pythonFloatString(0.01)).toBe('0.01');
    expect(pythonFloatString(2.5)).toBe('2.5');
  });

  it('formatea el cero negativo como Python', () => {
    expect(pythonFloatString(-0)).toBe('-0.0');
    expect(pythonFloatString(-1500)).toBe('-1500.0');
  });
});

describe('csvField', () => {
  it('deja el texto plano sin comillas', () => {
    expect(csvField('Almuerzo')).toBe('Almuerzo');
    expect(csvField('')).toBe('');
  });

  it('cita comas, comillas y saltos de línea', () => {
    expect(csvField('hola, mundo')).toBe('"hola, mundo"');
    expect(csvField('di "hola"')).toBe('"di ""hola"""');
    expect(csvField('linea1\nlinea2')).toBe('"linea1\nlinea2"');
    expect(csvField('linea1\r\nlinea2')).toBe('"linea1\r\nlinea2"');
  });
});

describe('csvRecordLine', () => {
  it('arma la línea en el orden de Python con CRLF', () => {
    expect(
      csvRecordLine({
        fecha: '2026-05-10',
        monto: '1500.0',
        moneda: 'ARS',
        categoria: 'Comida',
        descripcion: 'di "hola", che',
      }),
    ).toBe('2026-05-10,1500.0,ARS,Comida,"di ""hola"", che"\r\n');
  });

  it('el header coincide con el de csv.DictWriter', () => {
    expect(CSV_HEADER).toBe('Fecha,Monto,Moneda,Categoria,Descripcion\r\n');
  });
});
