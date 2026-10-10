# Municipios de Misiones (lista para la migración)

**Estado:** a revisar por el equipo antes de implementar.

## Fuentes
- [API Georef](https://apis.datos.gob.ar/georef/api/municipios?provincia=54&max=200&campos=id,nombre&orden=nombre), del Estado nacional (consultada el 2026-10-10). Trae 76 municipios y no incluye los creados desde 2020.
- Municipios creados después:
  - Salto Encantado, el n.° 77, en 2020 ([nota](https://misionesonline.net/2020/07/02/salto-encantado-se-convirtio-en-el-municipio-77-de-misiones-con-el-voto-de-los-diputados-provinciales/));
  - Fracrán, el 78, en 2022 ([nota](https://misionesonline.net/2022/10/27/ubicacion-de-fracran-misiones/));
  - Dos Hermanas, el 79, en mayo de 2025 ([nota](https://misionesonline.net/2025/05/14/legislatura-misiones-dos-hermanas/)). Tiene un interventor hasta las elecciones de 2027.

Las tres notas son de prensa. Conviene confirmarlas con el Ministerio o el Tribunal Electoral.

## Pendiente de decidir
Los ids van del 1 al 79 en orden alfabético. No uso el código INDEC (por ejemplo, `540119`) porque no entra en `smallint`, y el diccionario fija `smallint`. Un municipio que se cree más adelante toma el siguiente id libre, en una migración nueva.

## Lista (79)
25 de Mayo · 9 de Julio · Alba Posse · Almafuerte · Apóstoles · Aristóbulo del Valle · Arroyo del Medio · Azara ·
Bernardo de Irigoyen · Bonpland · Caá Yarí · Campo Grande · Campo Ramón · Campo Viera · Candelaria · Capioví ·
Caraguatay · Cerro Azul · Cerro Corá · Colonia Alberdi · Colonia Aurora · Colonia Delicia · Colonia Polana ·
Colonia Victoria · Colonia Wanda · Comandante Andresito · Concepción de la Sierra · Corpus Christi · Dos Arroyos ·
Dos de Mayo · **Dos Hermanas** · El Alcázar · El Soberbio · Eldorado · Fachinal · Florentino Ameghino · **Fracrán** ·
Garuhapé · Garupá · General Alvear · General Urquiza · Gobernador López · Gobernador Roca · Guaraní · Hipólito Yrigoyen ·
Itacaruaré · Jardín América · Leandro N. Alem · Libertad · Loreto · Los Helechos · Mártires · Mojón Grande · Montecarlo ·
Oberá · Olegario V. Andrade · Panambí · Posadas · Pozo Azul · Profundidad · Puerto Esperanza · Puerto Iguazú ·
Puerto Leoni · Puerto Piray · Puerto Rico · Ruiz de Montoya · **Salto Encantado** · San Antonio · San Ignacio ·
San Javier · San José · San Martín · San Pedro · San Vicente · Santa Ana · Santa María · Santiago de Liniers ·
Santo Pipó · Tres Capones

En negrita, los que agregué a la lista de Georef.
