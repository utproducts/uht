import React from 'react';
import { View, StyleSheet } from 'react-native';
import ScreenHeader from '../components/ScreenHeader';
import { colors } from '../constants/theme';
import { StatsBody } from './OrgScreens';

// Coach home card: combined record for every team the user coaches or manages
export default function TeamStatsScreen({ navigation }: any) {
  return (
    <View style={s.screen}>
      <ScreenHeader title="Team Stats" showBack onBack={() => navigation.goBack()} />
      <StatsBody
        url="/api/teams/my-stats"
        emptyText="No teams yet - stats build as your teams play UHT events."
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
});
