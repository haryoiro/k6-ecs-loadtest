FROM alpine:3.14

ARG SCENARIO_NAME=scenario1.js

COPY ./k6 /
COPY ./dist /scenarios

RUN chmod +x /k6

ENTRYPOINT ["/k6", "run", "/scenarios/$SCENARIO_NAME", "--out", "influxdb=http://10.1.0.254:8086/k6"]
