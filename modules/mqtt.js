define([
    'require',
    'module',
    '{angular}/angular'
], function (require, module, angular) {
    'use strict';

    var mqtt = angular.module('mqtt', ['ngResource']),
        config = module && module.config() || {};

    var NB_MS_IN_S = 1000;

    mqtt.factory('MqttClientService', ['HomeService', function (homeService) {
        return {
            halService: function (wildcardPath) {
                var href = config.baseUrl + '/clients';
                if (wildcardPath) {
                    href = config.baseUrl + '/' + wildcardPath + '/clients';
                }

                homeService('mqtt').register({
                    "clients": {
                        "hints": {
                            "allow": "GET"
                        },
                        "href": href
                    }
                });
                return homeService('mqtt').enter('clients');
            },
            list: function (success, error, wildcardPath) {
                this.halService(wildcardPath).get(success, error);
            },
            single: function (client, success, error) {
                return client.$links('self').get(success, error);
            }
        };
    }]);

    mqtt.controller('MqttMonitoringCtrl', ['$scope', '$interval', '$location', '$log', 'MqttClientService', function ($scope, $interval, $location, $log, mqttClientService) {

        $scope.autoRefresh = {
            "enable": false,
            "interval": 5
        };

        var refresh;
        $scope.toggleRefresh = function () {
            if (!$scope.autoRefresh.enable) {
                refresh = $interval(loadClientList, $scope.autoRefresh.interval * NB_MS_IN_S);
            } else {
                cancelInterval();
            }
            $scope.autoRefresh.enable = !$scope.autoRefresh.enable;
        };

        $scope.updateRefresh = function () {
            if (angular.isDefined(refresh)) {
                $interval.cancel(refresh);
                refresh = $interval(loadClientList, $scope.autoRefresh.interval * NB_MS_IN_S);
            }
        };

        $scope.$on('$routeChangeStart', function () {
            cancelInterval();
        });

        $scope.displayClient = function (client) {
            if (!$scope.currentClient || $scope.currentClient.clientId != client.clientId) {
                mqttClientService.single(client, function (result) {
                    $scope.currentClient = result;
                }, requestError);
            } else if ($scope.currentClient.clientId === client.clientId) {
                $scope.currentClient = undefined;
            }
        };

        $scope.isDisplayed = function () {
            return $scope.currentClient !== undefined;
        };

        $scope.filterInfosClient = function (client) {
            var toHide = ['serverURIs', 'topics', '_links', 'clientId', 'connected'];
            var result = {};
            angular.forEach(client, function (value, key) {
                if (toHide.indexOf(key) < 0) {
                    result[key] = value;
                }
            });
            return result;
        };

        function cancelInterval() {
            if (angular.isDefined(refresh)) {
                $interval.cancel(refresh);
                refresh = undefined;
            }
        }

        function updateInstance() {
            var path = $location.path().split("/");
            var instIdx = path.indexOf("instance");
            if (instIdx > -1) {
                $scope.instance = path[instIdx + 1];
            }
        }

        function loadClientList() {
            mqttClientService.list(function (data) {
                $scope.clients = data.$embedded('clients');
            }, requestError, $scope.instance);
        }

        function requestError(err) {
            $log.error('could not get mqtt clients : ' + err.message);
        }

        updateInstance();
        loadClientList();
    }]);

    return {
        angularModules: ['mqtt']
    };
});